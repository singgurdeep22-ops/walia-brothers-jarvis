from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Query, Request, Form
from fastapi.responses import StreamingResponse, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import re
import io
import httpx
import base64
import feedparser
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timedelta
from bson import ObjectId
import pandas as pd
from openpyxl import Workbook
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# LLM Key
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# Exotel Configuration
EXOTEL_API_KEY = os.environ.get('EXOTEL_API_KEY', '')
EXOTEL_API_TOKEN = os.environ.get('EXOTEL_API_TOKEN', '')
EXOTEL_SUBDOMAIN = os.environ.get('EXOTEL_SUBDOMAIN', 'api.exotel.com')
EXOTEL_SID = EXOTEL_API_KEY  # SID is usually the API key

# Create the main app
app = FastAPI(title="Walia Brothers Jarvis - Store Assistant")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Helper function to extract phone numbers from text
def extract_phone_numbers(text: str) -> List[str]:
    """Extract Indian phone numbers from text (10 digits, may have separators)"""
    if not text:
        return []
    # Pattern for Indian mobile numbers (10 digits, may have - or spaces)
    pattern = r'(?:(?:\+91|91|0)?[-\s]?)?([6-9]\d{4}[-\s]?\d{5})'
    matches = re.findall(pattern, text)
    # Clean the matches
    cleaned = []
    for match in matches:
        clean_num = re.sub(r'[-\s]', '', match)
        if len(clean_num) == 10:
            cleaned.append(clean_num)
    return cleaned

# ============ MODELS ============

class Customer(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: str
    address: Optional[str] = ""
    purchased_product: Optional[str] = ""
    brand: Optional[str] = ""
    purchase_date: Optional[str] = ""
    notes: Optional[str] = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    groups: List[str] = []

class CustomerCreate(BaseModel):
    name: str
    phone: str
    address: Optional[str] = ""
    purchased_product: Optional[str] = ""
    brand: Optional[str] = ""
    purchase_date: Optional[str] = ""
    notes: Optional[str] = ""
    groups: Optional[List[str]] = []

class Lead(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_name: str
    phone: str
    city: Optional[str] = ""
    product_interested: str
    model_number: Optional[str] = ""
    budget_range: Optional[str] = ""
    notes: Optional[str] = ""
    status: str = "New"  # New, Contacted, Closed, Not Interested
    follow_up_date: Optional[str] = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class LeadCreate(BaseModel):
    customer_name: str
    phone: str
    city: Optional[str] = ""
    product_interested: str
    model_number: Optional[str] = ""
    budget_range: Optional[str] = ""
    notes: Optional[str] = ""
    status: Optional[str] = "New"
    follow_up_date: Optional[str] = ""

class Complaint(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_phone: str
    customer_name: Optional[str] = ""
    product_type: str
    brand: str
    purchase_date: Optional[str] = ""
    product_size: Optional[str] = ""
    issue_description: str
    status: str = "Pending"  # Pending, In Progress, Resolved, Escalated
    assigned_to: Optional[str] = ""
    remarks: Optional[str] = ""
    follow_up_date: Optional[str] = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ComplaintCreate(BaseModel):
    customer_phone: str
    customer_name: Optional[str] = ""
    product_type: str
    brand: str
    purchase_date: Optional[str] = ""
    product_size: Optional[str] = ""
    issue_description: str
    assigned_to: Optional[str] = ""

class Campaign(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    message: str
    target_groups: List[str] = []
    scheduled_date: Optional[str] = ""
    status: str = "Draft"  # Draft, Scheduled, Sent
    sent_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)

class CampaignCreate(BaseModel):
    name: str
    message: str
    target_groups: Optional[List[str]] = []
    scheduled_date: Optional[str] = ""

class CustomerGroup(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)

class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = ""

class AppSettings(BaseModel):
    pin: str = "1234"
    store_name: str = "Walia Brothers"
    store_phone: str = ""
    store_address: str = ""

class StaffMember(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: Optional[str] = ""
    role: str = "Technician"  # Technician, Sales, Manager
    created_at: datetime = Field(default_factory=datetime.utcnow)

class StaffCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    role: Optional[str] = "Technician"

class BrandWhatsApp(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    brand_name: str
    whatsapp_number: str
    description: Optional[str] = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)

class BrandWhatsAppCreate(BaseModel):
    brand_name: str
    whatsapp_number: str
    description: Optional[str] = ""

# ============ AI TRAINING MODELS ============

class Product(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category: str  # TV, AC, Refrigerator, Washing Machine, etc.
    brand: str
    model_number: Optional[str] = ""
    base_price: float
    min_price: float  # Minimum negotiable price
    max_discount_percent: float = 10.0
    features: Optional[str] = ""
    in_stock: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ProductCreate(BaseModel):
    name: str
    category: str
    brand: str
    model_number: Optional[str] = ""
    base_price: float
    min_price: float
    max_discount_percent: Optional[float] = 10.0
    features: Optional[str] = ""
    in_stock: Optional[bool] = True

class StoreInfo(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    info_type: str  # delivery_area, payment_option, warranty, faq, workflow
    title: str
    content: str
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class StoreInfoCreate(BaseModel):
    info_type: str
    title: str
    content: str
    is_active: Optional[bool] = True

class ApprovalItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    item_type: str  # quote, lead, complaint
    customer_name: str
    customer_phone: str
    details: dict
    ai_response: str
    status: str = "pending"  # pending, approved, rejected
    created_at: datetime = Field(default_factory=datetime.utcnow)
    reviewed_at: Optional[datetime] = None
    notes: Optional[str] = ""

class WorkflowRule(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    rule_name: str
    trigger: str  # e.g., "customer_asks_price", "customer_complaint", "customer_wants_delivery"
    action: str  # e.g., "ask_approval", "auto_respond", "create_lead"
    response_template: Optional[str] = ""
    requires_approval: bool = True
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class WorkflowRuleCreate(BaseModel):
    rule_name: str
    trigger: str
    action: str
    response_template: Optional[str] = ""
    requires_approval: Optional[bool] = True
    is_active: Optional[bool] = True

# Default brand service numbers for WhatsApp deep linking
DEFAULT_BRAND_SERVICE_NUMBERS = {
    "LG": "9188005644",
    "Samsung": "9180001234",
    "Sony": "9180001234",
    "Whirlpool": "9180001234",
    "Panasonic": "9180001234",
    "Haier": "9180001234",
    "Lloyd": "9180001234",
    "Blue Star": "9180001234",
    "Voltas": "9180001234"
}

# ============ AUTH ROUTES ============

@api_router.post("/auth/verify-pin")
async def verify_pin(pin: str):
    settings = await db.settings.find_one({"type": "app_settings"})
    if not settings:
        # Create default settings
        default_settings = {"type": "app_settings", "pin": "1234", "store_name": "Walia Brothers"}
        await db.settings.insert_one(default_settings)
        settings = default_settings
    
    if settings.get("pin", "1234") == pin:
        return {"success": True, "message": "PIN verified"}
    else:
        raise HTTPException(status_code=401, detail="Invalid PIN")

@api_router.post("/auth/change-pin")
async def change_pin(old_pin: str, new_pin: str):
    settings = await db.settings.find_one({"type": "app_settings"})
    if not settings or settings.get("pin", "1234") == old_pin:
        await db.settings.update_one(
            {"type": "app_settings"},
            {"$set": {"pin": new_pin}},
            upsert=True
        )
        return {"success": True, "message": "PIN changed successfully"}
    else:
        raise HTTPException(status_code=401, detail="Invalid current PIN")

# ============ CUSTOMER ROUTES ============

@api_router.post("/customers", response_model=Customer)
async def create_customer(input: CustomerCreate):
    customer = Customer(**input.dict())
    await db.customers.insert_one(customer.dict())
    return customer

@api_router.get("/customers", response_model=List[Customer])
async def get_customers(
    search: Optional[str] = None,
    group: Optional[str] = None,
    brand: Optional[str] = None,
    limit: int = 100,
    skip: int = 0
):
    query = {}
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}}
        ]
    if group:
        query["groups"] = group
    if brand:
        query["brand"] = {"$regex": brand, "$options": "i"}
    
    customers = await db.customers.find(query).skip(skip).limit(limit).to_list(limit)
    return [Customer(**c) for c in customers]

@api_router.get("/customers/{customer_id}", response_model=Customer)
async def get_customer(customer_id: str):
    customer = await db.customers.find_one({"id": customer_id})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return Customer(**customer)

@api_router.put("/customers/{customer_id}", response_model=Customer)
async def update_customer(customer_id: str, input: CustomerCreate):
    update_data = input.dict()
    update_data["updated_at"] = datetime.utcnow()
    result = await db.customers.update_one({"id": customer_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    customer = await db.customers.find_one({"id": customer_id})
    return Customer(**customer)

@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str):
    result = await db.customers.delete_one({"id": customer_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    return {"success": True, "message": "Customer deleted"}

# ============ LEAD ROUTES ============

@api_router.post("/leads", response_model=Lead)
async def create_lead(input: LeadCreate):
    lead = Lead(**input.dict())
    await db.leads.insert_one(lead.dict())
    return lead

@api_router.get("/leads", response_model=List[Lead])
async def get_leads(
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
    skip: int = 0
):
    query = {}
    if status:
        query["status"] = status
    if search:
        query["$or"] = [
            {"customer_name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
            {"product_interested": {"$regex": search, "$options": "i"}}
        ]
    
    leads = await db.leads.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return [Lead(**l) for l in leads]

@api_router.put("/leads/{lead_id}", response_model=Lead)
async def update_lead(lead_id: str, input: LeadCreate):
    update_data = input.dict()
    update_data["updated_at"] = datetime.utcnow()
    result = await db.leads.update_one({"id": lead_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead = await db.leads.find_one({"id": lead_id})
    return Lead(**lead)

@api_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str):
    result = await db.leads.delete_one({"id": lead_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"success": True, "message": "Lead deleted"}

# ============ COMPLAINT ROUTES ============

@api_router.post("/complaints", response_model=Complaint)
async def create_complaint(input: ComplaintCreate):
    complaint = Complaint(**input.dict())
    await db.complaints.insert_one(complaint.dict())
    return complaint

@api_router.get("/complaints", response_model=List[Complaint])
async def get_complaints(
    status: Optional[str] = None,
    brand: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
    skip: int = 0
):
    query = {}
    if status:
        query["status"] = status
    if brand:
        query["brand"] = {"$regex": brand, "$options": "i"}
    if search:
        query["$or"] = [
            {"customer_phone": {"$regex": search, "$options": "i"}},
            {"customer_name": {"$regex": search, "$options": "i"}}
        ]
    
    complaints = await db.complaints.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return [Complaint(**c) for c in complaints]

@api_router.put("/complaints/{complaint_id}", response_model=Complaint)
async def update_complaint(complaint_id: str, status: Optional[str] = None, remarks: Optional[str] = None, assigned_to: Optional[str] = None):
    update_data = {"updated_at": datetime.utcnow()}
    if status:
        update_data["status"] = status
    if remarks:
        update_data["remarks"] = remarks
    if assigned_to:
        update_data["assigned_to"] = assigned_to
    
    result = await db.complaints.update_one({"id": complaint_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Complaint not found")
    complaint = await db.complaints.find_one({"id": complaint_id})
    return Complaint(**complaint)

@api_router.delete("/complaints/{complaint_id}")
async def delete_complaint(complaint_id: str):
    result = await db.complaints.delete_one({"id": complaint_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return {"success": True, "message": "Complaint deleted"}

@api_router.get("/complaints/{complaint_id}/whatsapp-link")
async def get_complaint_whatsapp_link(complaint_id: str):
    complaint = await db.complaints.find_one({"id": complaint_id})
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
    
    brand = complaint.get("brand", "")
    # Get WhatsApp number from database
    service_number = await get_brand_whatsapp_number(brand)
    
    message = f"""Service Complaint from Walia Brothers Electronics
Customer: {complaint.get('customer_name', 'N/A')}
Phone: {complaint.get('customer_phone', 'N/A')}
Product: {complaint.get('product_type', 'N/A')}
Brand: {brand}
Size: {complaint.get('product_size', 'N/A')}
Purchase Date: {complaint.get('purchase_date', 'N/A')}
Issue: {complaint.get('issue_description', 'N/A')}"""
    
    import urllib.parse
    encoded_message = urllib.parse.quote(message)
    whatsapp_link = f"https://wa.me/91{service_number}?text={encoded_message}"
    
    return {"whatsapp_link": whatsapp_link, "service_number": service_number, "brand": brand}

# ============ CAMPAIGN ROUTES ============

@api_router.post("/campaigns", response_model=Campaign)
async def create_campaign(input: CampaignCreate):
    campaign = Campaign(**input.dict())
    await db.campaigns.insert_one(campaign.dict())
    return campaign

@api_router.get("/campaigns", response_model=List[Campaign])
async def get_campaigns(limit: int = 100, skip: int = 0):
    campaigns = await db.campaigns.find().sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return [Campaign(**c) for c in campaigns]

@api_router.delete("/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str):
    result = await db.campaigns.delete_one({"id": campaign_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return {"success": True, "message": "Campaign deleted"}

@api_router.get("/campaigns/{campaign_id}/contacts")
async def get_campaign_contacts(campaign_id: str):
    campaign = await db.campaigns.find_one({"id": campaign_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    target_groups = campaign.get("target_groups", [])
    if not target_groups:
        customers = await db.customers.find().to_list(1000)
    else:
        customers = await db.customers.find({"groups": {"$in": target_groups}}).to_list(1000)
    
    contacts = [{"name": c.get("name"), "phone": c.get("phone")} for c in customers]
    return {"contacts": contacts, "count": len(contacts)}

# ============ GROUP ROUTES ============

@api_router.post("/groups", response_model=CustomerGroup)
async def create_group(input: GroupCreate):
    group = CustomerGroup(**input.dict())
    await db.groups.insert_one(group.dict())
    return group

@api_router.get("/groups", response_model=List[CustomerGroup])
async def get_groups():
    groups = await db.groups.find().to_list(100)
    return [CustomerGroup(**g) for g in groups]

@api_router.delete("/groups/{group_id}")
async def delete_group(group_id: str):
    result = await db.groups.delete_one({"id": group_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Group not found")
    return {"success": True, "message": "Group deleted"}

@api_router.post("/customers/{customer_id}/groups/{group_name}")
async def add_customer_to_group(customer_id: str, group_name: str):
    result = await db.customers.update_one(
        {"id": customer_id},
        {"$addToSet": {"groups": group_name}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    return {"success": True}

@api_router.delete("/customers/{customer_id}/groups/{group_name}")
async def remove_customer_from_group(customer_id: str, group_name: str):
    result = await db.customers.update_one(
        {"id": customer_id},
        {"$pull": {"groups": group_name}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    return {"success": True}

# ============ STAFF ROUTES ============

@api_router.post("/staff", response_model=StaffMember)
async def create_staff(input: StaffCreate):
    staff = StaffMember(**input.dict())
    await db.staff.insert_one(staff.dict())
    return staff

@api_router.get("/staff", response_model=List[StaffMember])
async def get_staff():
    staff = await db.staff.find().to_list(100)
    return [StaffMember(**s) for s in staff]

@api_router.delete("/staff/{staff_id}")
async def delete_staff(staff_id: str):
    result = await db.staff.delete_one({"id": staff_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Staff not found")
    return {"success": True, "message": "Staff deleted"}

# ============ BRAND WHATSAPP ROUTES ============

@api_router.post("/brands", response_model=BrandWhatsApp)
async def create_brand_whatsapp(input: BrandWhatsAppCreate):
    """Add a brand with its WhatsApp service number"""
    # Check if brand already exists
    existing = await db.brand_whatsapp.find_one({"brand_name": {"$regex": f"^{input.brand_name}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=400, detail="Brand already exists. Please update instead.")
    
    brand = BrandWhatsApp(**input.dict())
    await db.brand_whatsapp.insert_one(brand.dict())
    return brand

@api_router.get("/brands", response_model=List[BrandWhatsApp])
async def get_brands():
    """Get all brands with WhatsApp numbers"""
    brands = await db.brand_whatsapp.find().to_list(100)
    
    # If no brands in DB, initialize with defaults
    if not brands:
        for brand_name, number in DEFAULT_BRAND_SERVICE_NUMBERS.items():
            brand = BrandWhatsApp(brand_name=brand_name, whatsapp_number=number)
            await db.brand_whatsapp.insert_one(brand.dict())
        brands = await db.brand_whatsapp.find().to_list(100)
    
    return [BrandWhatsApp(**b) for b in brands]

@api_router.put("/brands/{brand_id}")
async def update_brand_whatsapp(brand_id: str, whatsapp_number: str, description: Optional[str] = None):
    """Update a brand's WhatsApp number"""
    update_data = {"whatsapp_number": whatsapp_number}
    if description is not None:
        update_data["description"] = description
    
    result = await db.brand_whatsapp.update_one({"id": brand_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Brand not found")
    
    brand = await db.brand_whatsapp.find_one({"id": brand_id})
    return BrandWhatsApp(**brand)

@api_router.delete("/brands/{brand_id}")
async def delete_brand_whatsapp(brand_id: str):
    """Delete a brand"""
    result = await db.brand_whatsapp.delete_one({"id": brand_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Brand not found")
    return {"success": True, "message": "Brand deleted"}

async def get_brand_whatsapp_number(brand_name: str) -> str:
    """Helper function to get WhatsApp number for a brand"""
    brand = await db.brand_whatsapp.find_one({"brand_name": {"$regex": f"^{brand_name}$", "$options": "i"}})
    if brand:
        return brand.get("whatsapp_number", "9180001234")
    # Fallback to defaults
    return DEFAULT_BRAND_SERVICE_NUMBERS.get(brand_name, "9180001234")

# ============ PRODUCTS (AI TRAINING) ============

@api_router.post("/products", response_model=Product)
async def create_product(input: ProductCreate):
    """Add a product for AI to know about"""
    product = Product(**input.dict())
    await db.products.insert_one(product.dict())
    return product

@api_router.get("/products", response_model=List[Product])
async def get_products(category: Optional[str] = None, brand: Optional[str] = None, in_stock: Optional[bool] = None):
    """Get all products"""
    query = {}
    if category:
        query["category"] = {"$regex": category, "$options": "i"}
    if brand:
        query["brand"] = {"$regex": brand, "$options": "i"}
    if in_stock is not None:
        query["in_stock"] = in_stock
    
    products = await db.products.find(query).to_list(500)
    return [Product(**p) for p in products]

@api_router.put("/products/{product_id}")
async def update_product(product_id: str, input: ProductCreate):
    """Update a product"""
    result = await db.products.update_one({"id": product_id}, {"$set": input.dict()})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    product = await db.products.find_one({"id": product_id})
    return Product(**product)

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str):
    """Delete a product"""
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"success": True, "message": "Product deleted"}

# ============ STORE INFO (AI TRAINING) ============

@api_router.post("/store-info", response_model=StoreInfo)
async def create_store_info(input: StoreInfoCreate):
    """Add store information for AI"""
    info = StoreInfo(**input.dict())
    await db.store_info.insert_one(info.dict())
    return info

@api_router.get("/store-info")
async def get_store_info(info_type: Optional[str] = None):
    """Get store information"""
    query = {"is_active": True}
    if info_type:
        query["info_type"] = info_type
    
    info_list = await db.store_info.find(query).to_list(100)
    return [StoreInfo(**i) for i in info_list]

@api_router.put("/store-info/{info_id}")
async def update_store_info(info_id: str, title: Optional[str] = None, content: Optional[str] = None, is_active: Optional[bool] = None):
    """Update store info"""
    update_data = {}
    if title:
        update_data["title"] = title
    if content:
        update_data["content"] = content
    if is_active is not None:
        update_data["is_active"] = is_active
    
    result = await db.store_info.update_one({"id": info_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Store info not found")
    return {"success": True}

@api_router.delete("/store-info/{info_id}")
async def delete_store_info(info_id: str):
    """Delete store info"""
    result = await db.store_info.delete_one({"id": info_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Store info not found")
    return {"success": True, "message": "Store info deleted"}

# ============ WORKFLOW RULES ============

@api_router.post("/workflow-rules", response_model=WorkflowRule)
async def create_workflow_rule(input: WorkflowRuleCreate):
    """Add a workflow rule for AI"""
    rule = WorkflowRule(**input.dict())
    await db.workflow_rules.insert_one(rule.dict())
    return rule

@api_router.get("/workflow-rules")
async def get_workflow_rules():
    """Get all workflow rules"""
    rules = await db.workflow_rules.find().to_list(100)
    return [WorkflowRule(**r) for r in rules]

@api_router.put("/workflow-rules/{rule_id}")
async def update_workflow_rule(rule_id: str, input: WorkflowRuleCreate):
    """Update a workflow rule"""
    result = await db.workflow_rules.update_one({"id": rule_id}, {"$set": input.dict()})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"success": True}

@api_router.delete("/workflow-rules/{rule_id}")
async def delete_workflow_rule(rule_id: str):
    """Delete a workflow rule"""
    result = await db.workflow_rules.delete_one({"id": rule_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"success": True, "message": "Rule deleted"}

# ============ APPROVAL QUEUE ============

@api_router.get("/approvals")
async def get_pending_approvals():
    """Get pending approval items"""
    items = await db.approvals.find({"status": "pending"}).sort("created_at", -1).to_list(50)
    return [ApprovalItem(**i) for i in items]

@api_router.post("/approvals")
async def create_approval_item(item_type: str, customer_name: str, customer_phone: str, details: dict, ai_response: str):
    """Create an approval item (used by AI)"""
    item = ApprovalItem(
        item_type=item_type,
        customer_name=customer_name,
        customer_phone=customer_phone,
        details=details,
        ai_response=ai_response
    )
    await db.approvals.insert_one(item.dict())
    return item

@api_router.put("/approvals/{item_id}/approve")
async def approve_item(item_id: str, notes: Optional[str] = None):
    """Approve an item and execute the action"""
    item = await db.approvals.find_one({"id": item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Approval item not found")
    
    # Execute the action based on type
    if item.get("item_type") == "quote":
        # Create lead from approved quote
        lead_data = {
            "customer_name": item.get("customer_name"),
            "phone": item.get("customer_phone"),
            "product_interested": item.get("details", {}).get("product", ""),
            "budget_range": item.get("details", {}).get("quoted_price", ""),
            "notes": f"Approved quote. {notes or ''}",
            "status": "Contacted"
        }
        lead = Lead(**lead_data)
        await db.leads.insert_one(lead.dict())
    
    elif item.get("item_type") == "complaint":
        # Create complaint from approved item
        complaint_data = {
            "customer_phone": item.get("customer_phone"),
            "customer_name": item.get("customer_name"),
            "product_type": item.get("details", {}).get("product_type", ""),
            "brand": item.get("details", {}).get("brand", ""),
            "issue_description": item.get("details", {}).get("issue", ""),
            "status": "Pending"
        }
        complaint = Complaint(**complaint_data)
        await db.complaints.insert_one(complaint.dict())
    
    # Update approval status
    await db.approvals.update_one(
        {"id": item_id},
        {"$set": {"status": "approved", "reviewed_at": datetime.utcnow(), "notes": notes}}
    )
    
    return {"success": True, "message": "Item approved and action executed"}

@api_router.put("/approvals/{item_id}/reject")
async def reject_item(item_id: str, notes: Optional[str] = None):
    """Reject an approval item"""
    result = await db.approvals.update_one(
        {"id": item_id},
        {"$set": {"status": "rejected", "reviewed_at": datetime.utcnow(), "notes": notes}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Approval item not found")
    return {"success": True, "message": "Item rejected"}

# Helper function to get AI training data
async def get_ai_training_context():
    """Get all training data for AI"""
    products = await db.products.find({"in_stock": True}).to_list(100)
    store_info = await db.store_info.find({"is_active": True}).to_list(50)
    workflow_rules = await db.workflow_rules.find({"is_active": True}).to_list(20)
    
    context = {
        "products": products,
        "store_info": {info.get("info_type"): [] for info in store_info},
        "workflow_rules": workflow_rules
    }
    
    for info in store_info:
        info_type = info.get("info_type", "other")
        if info_type not in context["store_info"]:
            context["store_info"][info_type] = []
        context["store_info"][info_type].append({
            "title": info.get("title"),
            "content": info.get("content")
        })
    
    return context

# ============ EXCEL IMPORT/EXPORT ============

@api_router.post("/import/customers")
async def import_customers(file: UploadFile = File(...)):
    """Import customers from Excel file with phone number extraction from address"""
    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
        imported_count = 0
        errors = []
        
        for idx, row in df.iterrows():
            try:
                name = str(row.get('Name', row.get('name', row.get('Customer Name', row.get('customer_name', '')))))
                phone = str(row.get('Phone', row.get('phone', row.get('Mobile', row.get('mobile', '')))))
                address = str(row.get('Address', row.get('address', '')))
                
                # Extract phone from address if phone is empty
                if not phone or phone == 'nan' or phone == '':
                    extracted = extract_phone_numbers(address)
                    if extracted:
                        phone = extracted[0]
                
                # Clean phone number
                if phone and phone != 'nan':
                    phone = re.sub(r'[^\d]', '', str(phone))
                    if len(phone) > 10:
                        phone = phone[-10:]
                
                if not name or name == 'nan' or not phone or len(phone) < 10:
                    continue
                
                customer_data = {
                    "name": name,
                    "phone": phone,
                    "address": address if address != 'nan' else "",
                    "purchased_product": str(row.get('Product', row.get('product', ''))) if str(row.get('Product', '')) != 'nan' else "",
                    "brand": str(row.get('Brand', row.get('brand', ''))) if str(row.get('Brand', '')) != 'nan' else "",
                    "purchase_date": str(row.get('Date', row.get('date', row.get('Purchase Date', '')))) if str(row.get('Date', '')) != 'nan' else "",
                    "notes": str(row.get('Notes', row.get('notes', ''))) if str(row.get('Notes', '')) != 'nan' else ""
                }
                
                customer = Customer(**customer_data)
                await db.customers.insert_one(customer.dict())
                imported_count += 1
                
            except Exception as e:
                errors.append(f"Row {idx + 1}: {str(e)}")
        
        return {
            "success": True,
            "imported_count": imported_count,
            "errors": errors[:10]  # Return first 10 errors
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to import: {str(e)}")

@api_router.get("/export/customers")
async def export_customers(group: Optional[str] = None):
    """Export customers to Excel file"""
    query = {}
    if group:
        query["groups"] = group
    
    customers = await db.customers.find(query).to_list(10000)
    
    # Create DataFrame
    data = []
    for c in customers:
        data.append({
            "Name": c.get("name", ""),
            "Phone": c.get("phone", ""),
            "Address": c.get("address", ""),
            "Product": c.get("purchased_product", ""),
            "Brand": c.get("brand", ""),
            "Purchase Date": c.get("purchase_date", ""),
            "Notes": c.get("notes", ""),
            "Groups": ", ".join(c.get("groups", []))
        })
    
    df = pd.DataFrame(data)
    
    # Create Excel file in memory
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        df.to_excel(writer, sheet_name='Customers', index=False)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=customers.xlsx"}
    )

@api_router.get("/export/leads")
async def export_leads():
    """Export leads to Excel file"""
    leads = await db.leads.find().to_list(10000)
    
    data = []
    for l in leads:
        data.append({
            "Customer Name": l.get("customer_name", ""),
            "Phone": l.get("phone", ""),
            "City": l.get("city", ""),
            "Product Interested": l.get("product_interested", ""),
            "Model": l.get("model_number", ""),
            "Budget": l.get("budget_range", ""),
            "Status": l.get("status", ""),
            "Follow Up Date": l.get("follow_up_date", ""),
            "Notes": l.get("notes", "")
        })
    
    df = pd.DataFrame(data)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        df.to_excel(writer, sheet_name='Leads', index=False)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=leads.xlsx"}
    )

# ============ DASHBOARD & ANALYTICS ============

@api_router.get("/dashboard/stats")
async def get_dashboard_stats():
    """Get dashboard statistics"""
    total_customers = await db.customers.count_documents({})
    total_leads = await db.leads.count_documents({})
    new_leads = await db.leads.count_documents({"status": "New"})
    pending_complaints = await db.complaints.count_documents({"status": "Pending"})
    total_complaints = await db.complaints.count_documents({})
    total_campaigns = await db.campaigns.count_documents({})
    
    # Get brand distribution
    pipeline = [
        {"$group": {"_id": "$brand", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5}
    ]
    brand_stats = await db.customers.aggregate(pipeline).to_list(5)
    
    # Get lead status distribution
    lead_pipeline = [
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    lead_stats = await db.leads.aggregate(lead_pipeline).to_list(10)
    
    return {
        "total_customers": total_customers,
        "total_leads": total_leads,
        "new_leads": new_leads,
        "pending_complaints": pending_complaints,
        "total_complaints": total_complaints,
        "total_campaigns": total_campaigns,
        "top_brands": [{"brand": b["_id"] or "Unknown", "count": b["count"]} for b in brand_stats if b["_id"]],
        "lead_status": {l["_id"]: l["count"] for l in lead_stats}
    }

@api_router.get("/dashboard/follow-ups")
async def get_today_follow_ups():
    """Get today's follow-ups"""
    today = datetime.now().strftime("%Y-%m-%d")
    
    leads = await db.leads.find({"follow_up_date": today}).to_list(100)
    complaints = await db.complaints.find({"follow_up_date": today}).to_list(100)
    
    return {
        "leads": [Lead(**l) for l in leads],
        "complaints": [Complaint(**c) for c in complaints]
    }

# ============ AI ANALYTICS ============

@api_router.post("/ai/analyze")
async def ai_analyze(query: str):
    """AI-powered analytics and insights"""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="AI features not configured")
    
    # Get summary data for context
    total_customers = await db.customers.count_documents({})
    total_leads = await db.leads.count_documents({})
    pending_complaints = await db.complaints.count_documents({"status": "Pending"})
    
    # Get recent leads
    recent_leads = await db.leads.find().sort("created_at", -1).limit(5).to_list(5)
    
    # Get brand distribution
    brand_pipeline = [
        {"$group": {"_id": "$brand", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5}
    ]
    brand_stats = await db.customers.aggregate(brand_pipeline).to_list(5)
    
    context = f"""
    Store Data Summary:
    - Total Customers: {total_customers}
    - Total Leads: {total_leads}
    - Pending Complaints: {pending_complaints}
    - Top Brands Sold: {', '.join([f"{b['_id']}({b['count']})" for b in brand_stats if b['_id']])}
    - Recent Leads: {', '.join([f"{l.get('customer_name')} interested in {l.get('product_interested')}" for l in recent_leads])}
    """
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"jarvis-analysis-{uuid.uuid4()}",
            system_message=f"""You are Jarvis, the AI assistant for Walia Brothers Electronics Store. 
You help with sales insights, customer analytics, and business recommendations.
You speak in a helpful, professional manner suitable for a retail electronics store in India.

{context}

Provide concise, actionable insights. Keep responses under 200 words."""
        ).with_model("openai", "gpt-4o")
        
        response = await chat.send_message(UserMessage(text=query))
        return {"response": response, "success": True}
    except Exception as e:
        logging.error(f"AI analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")

# ============ WEATHER & SMART MARKETING ============

# Cache for weather data (refresh every 30 mins)
weather_cache = {"data": None, "timestamp": None}

@api_router.get("/weather")
async def get_weather():
    """Get live weather for Punjab, India (Ludhiana area)"""
    import time
    
    # Check cache (30 min expiry)
    if weather_cache["data"] and weather_cache["timestamp"]:
        if time.time() - weather_cache["timestamp"] < 1800:  # 30 mins
            return weather_cache["data"]
    
    try:
        # Using Open-Meteo API (free, no key required)
        # Ludhiana, Punjab coordinates: 30.9, 75.85
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": 30.9,
                    "longitude": 75.85,
                    "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
                    "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
                    "timezone": "Asia/Kolkata",
                    "forecast_days": 3
                },
                timeout=10.0
            )
            
            if response.status_code == 200:
                data = response.json()
                current = data.get("current", {})
                daily = data.get("daily", {})
                
                # Weather code to description
                weather_codes = {
                    0: "Clear", 1: "Mainly Clear", 2: "Partly Cloudy", 3: "Overcast",
                    45: "Foggy", 48: "Foggy", 51: "Light Drizzle", 53: "Drizzle", 55: "Heavy Drizzle",
                    61: "Light Rain", 63: "Rain", 65: "Heavy Rain", 71: "Light Snow", 73: "Snow",
                    75: "Heavy Snow", 80: "Light Showers", 81: "Showers", 82: "Heavy Showers",
                    95: "Thunderstorm", 96: "Thunderstorm with Hail", 99: "Severe Thunderstorm"
                }
                
                weather_code = current.get("weather_code", 0)
                condition = weather_codes.get(weather_code, "Unknown")
                
                weather_data = {
                    "location": "Ludhiana, Punjab",
                    "temperature": current.get("temperature_2m"),
                    "humidity": current.get("relative_humidity_2m"),
                    "wind_speed": current.get("wind_speed_10m"),
                    "condition": condition,
                    "weather_code": weather_code,
                    "forecast": [
                        {
                            "day": daily.get("time", [])[i] if i < len(daily.get("time", [])) else None,
                            "max_temp": daily.get("temperature_2m_max", [])[i] if i < len(daily.get("temperature_2m_max", [])) else None,
                            "min_temp": daily.get("temperature_2m_min", [])[i] if i < len(daily.get("temperature_2m_min", [])) else None,
                            "rain_chance": daily.get("precipitation_probability_max", [])[i] if i < len(daily.get("precipitation_probability_max", [])) else None,
                        }
                        for i in range(min(3, len(daily.get("time", []))))
                    ],
                    "timestamp": datetime.utcnow().isoformat()
                }
                
                # Cache the result
                weather_cache["data"] = weather_data
                weather_cache["timestamp"] = time.time()
                
                return weather_data
    except Exception as e:
        logging.error(f"Weather API error: {str(e)}")
    
    # Return fallback data
    return {
        "location": "Ludhiana, Punjab",
        "temperature": 25,
        "humidity": 60,
        "condition": "Clear",
        "weather_code": 0,
        "forecast": [],
        "timestamp": datetime.utcnow().isoformat(),
        "fallback": True
    }

# Cache for market news (refresh every hour)
market_news_cache = {"data": None, "timestamp": None}

@api_router.get("/market-trends")
async def get_market_trends():
    """Get market trends from Google News RSS - FREE, no API key needed"""
    import time
    
    # Check cache (1 hour expiry)
    if market_news_cache["data"] and market_news_cache["timestamp"]:
        if time.time() - market_news_cache["timestamp"] < 3600:  # 1 hour
            return market_news_cache["data"]
    
    # Keywords to monitor for electronics store
    keywords = [
        "LPG price India",
        "copper price India",
        "electricity tariff India",
        "AC price India",
        "electronics sale India",
        "inflation India consumer",
        "Punjab electricity",
    ]
    
    all_news = []
    alerts = []
    
    try:
        for keyword in keywords[:4]:  # Limit to 4 keywords to avoid timeout
            # Google News RSS URL
            rss_url = f"https://news.google.com/rss/search?q={keyword.replace(' ', '+')}&hl=en-IN&gl=IN&ceid=IN:en"
            
            try:
                feed = feedparser.parse(rss_url)
                
                for entry in feed.entries[:2]:  # Get top 2 per keyword
                    news_item = {
                        "title": str(entry.get("title", "")),
                        "link": str(entry.get("link", "")),
                        "published": str(entry.get("published", "")),
                        "keyword": keyword,
                    }
                    all_news.append(news_item)
                    
                    # Generate alerts based on news
                    title_lower = news_item["title"].lower()
                    
                    # LPG price alerts
                    if "lpg" in title_lower and ("hike" in title_lower or "increase" in title_lower or "rise" in title_lower):
                        alerts.append({
                            "type": "market_trend",
                            "trigger": "LPG Price Hike",
                            "suggestion": "Stock up on Induction Cooktops and Air Fryers - customers will switch from gas!",
                            "products": ["Induction Cooktop", "Air Fryer", "Electric Kettle", "Microwave"],
                            "priority": "high",
                            "news_title": news_item["title"],
                            "action_required": True
                        })
                    
                    # Copper price alerts
                    if "copper" in title_lower and ("hike" in title_lower or "increase" in title_lower or "rise" in title_lower or "high" in title_lower):
                        alerts.append({
                            "type": "market_trend",
                            "trigger": "Copper Price Hike",
                            "suggestion": "Stock up ACs NOW before prices increase - copper is major AC component!",
                            "products": ["Air Conditioner", "Refrigerator", "Washing Machine"],
                            "priority": "high",
                            "news_title": news_item["title"],
                            "action_required": True
                        })
                    
                    # Electricity tariff alerts
                    if "electricity" in title_lower and ("tariff" in title_lower or "rate" in title_lower or "hike" in title_lower):
                        alerts.append({
                            "type": "market_trend",
                            "trigger": "Electricity Rate Change",
                            "suggestion": "Promote energy-efficient appliances with 5-star rating!",
                            "products": ["Inverter AC", "LED TV", "Inverter Refrigerator"],
                            "priority": "medium",
                            "news_title": news_item["title"],
                            "action_required": True
                        })
            except Exception as feed_error:
                logging.error(f"Feed parse error for {keyword}: {str(feed_error)}")
                continue
        
        # Remove duplicate alerts
        seen_triggers = set()
        unique_alerts = []
        for alert in alerts:
            if alert["trigger"] not in seen_triggers:
                seen_triggers.add(alert["trigger"])
                unique_alerts.append(alert)
        
        result = {
            "news": all_news[:15],  # Top 15 news items
            "alerts": unique_alerts,
            "alert_count": len(unique_alerts),
            "keywords_monitored": keywords,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Cache the result
        market_news_cache["data"] = result
        market_news_cache["timestamp"] = time.time()
        
        # Store alerts in DB for Jarvis
        if unique_alerts:
            for alert in unique_alerts:
                alert["id"] = str(uuid.uuid4())
                alert["created_at"] = datetime.utcnow().isoformat()
                alert["status"] = "pending_review"
            
            # Only insert new alerts (check by trigger name)
            for alert in unique_alerts:
                existing = await db.market_alerts.find_one({
                    "trigger": alert["trigger"],
                    "created_at": {"$gte": (datetime.utcnow() - timedelta(hours=24)).isoformat()}
                })
                if not existing:
                    await db.market_alerts.insert_one(alert)
        
        return result
        
    except Exception as e:
        logging.error(f"Market trends error: {str(e)}")
        return {
            "news": [],
            "alerts": [],
            "alert_count": 0,
            "keywords_monitored": keywords,
            "timestamp": datetime.utcnow().isoformat(),
            "error": str(e)
        }

@api_router.get("/market-alerts")
async def get_market_alerts():
    """Get pending market alerts for review"""
    alerts = await db.market_alerts.find({"status": "pending_review"}).sort("created_at", -1).limit(20).to_list(20)
    # Convert ObjectId to string
    for alert in alerts:
        if "_id" in alert:
            alert["_id"] = str(alert["_id"])
    return {"alerts": alerts, "count": len(alerts)}

@api_router.post("/market-alerts/{alert_id}/acknowledge")
async def acknowledge_market_alert(alert_id: str):
    """Acknowledge/dismiss a market alert"""
    await db.market_alerts.update_one(
        {"id": alert_id},
        {"$set": {"status": "acknowledged", "acknowledged_at": datetime.utcnow().isoformat()}}
    )
    return {"message": "Alert acknowledged", "id": alert_id}

@api_router.get("/marketing/smart-suggestions")
async def get_smart_marketing_suggestions():
    """Get AI-powered marketing suggestions based on weather, trends, and inventory"""
    
    # Get weather
    weather = await get_weather()
    temp = weather.get("temperature", 25)
    condition = weather.get("condition", "Clear")
    rain_chance = weather.get("forecast", [{}])[0].get("rain_chance", 0) if weather.get("forecast") else 0
    
    # Get products
    products = await db.products.find().to_list(100)
    product_names = [p.get("name", "").lower() for p in products]
    
    # Get pending approvals (marketing tasks waiting)
    pending_marketing = await db.marketing_suggestions.find({"status": "pending"}).to_list(50)
    
    suggestions = []
    
    # Weather-based suggestions
    if temp > 35:  # Hot weather
        suggestions.append({
            "type": "weather",
            "trigger": f"Hot weather ({temp}°C)",
            "suggestion": "Perfect time to promote ACs, coolers, and refrigerators",
            "products": ["Air Conditioner", "Cooler", "Refrigerator", "Fan"],
            "action": "send_promotion",
            "priority": "high"
        })
    elif temp < 15:  # Cold weather
        suggestions.append({
            "type": "weather",
            "trigger": f"Cold weather ({temp}°C)",
            "suggestion": "Promote room heaters, geysers, and washing machines with dryer",
            "products": ["Room Heater", "Geyser", "Washer Dryer", "Oven", "Induction"],
            "action": "send_promotion",
            "priority": "high"
        })
    
    if rain_chance and rain_chance > 60:  # Rainy weather expected
        suggestions.append({
            "type": "weather",
            "trigger": f"Rain expected ({rain_chance}% chance)",
            "suggestion": "Stock up and promote washing machines, dryers, and water heaters",
            "products": ["Washing Machine", "Dryer", "Geyser"],
            "action": "stock_alert",
            "priority": "medium"
        })
    
    if "fog" in condition.lower():
        suggestions.append({
            "type": "weather",
            "trigger": "Foggy conditions",
            "suggestion": "Good time to promote home appliances - people staying indoors",
            "products": ["TV", "Home Theater", "Kitchen Appliances"],
            "action": "send_promotion",
            "priority": "medium"
        })
    
    # Store in DB for Jarvis approval workflow
    for suggestion in suggestions:
        suggestion["id"] = str(uuid.uuid4())
        suggestion["created_at"] = datetime.utcnow().isoformat()
        suggestion["status"] = "pending_approval"
    
    if suggestions:
        await db.marketing_suggestions.insert_many(suggestions)
    
    return {
        "weather": weather,
        "suggestions": suggestions,
        "pending_count": len(pending_marketing) + len(suggestions)
    }

@api_router.get("/marketing/pending")
async def get_pending_marketing():
    """Get pending marketing suggestions awaiting approval"""
    pending = await db.marketing_suggestions.find({"status": "pending_approval"}).to_list(50)
    return {"pending": pending, "count": len(pending)}

@api_router.post("/marketing/approve/{suggestion_id}")
async def approve_marketing_suggestion(suggestion_id: str):
    """Approve a marketing suggestion"""
    result = await db.marketing_suggestions.update_one(
        {"id": suggestion_id},
        {"$set": {"status": "approved", "approved_at": datetime.utcnow().isoformat()}}
    )
    if result.modified_count > 0:
        return {"message": "Marketing task approved", "id": suggestion_id}
    raise HTTPException(status_code=404, detail="Suggestion not found")

@api_router.post("/marketing/reject/{suggestion_id}")
async def reject_marketing_suggestion(suggestion_id: str):
    """Reject a marketing suggestion"""
    await db.marketing_suggestions.update_one(
        {"id": suggestion_id},
        {"$set": {"status": "rejected", "rejected_at": datetime.utcnow().isoformat()}}
    )
    return {"message": "Marketing task rejected", "id": suggestion_id}

@api_router.get("/ai/suggestions")
async def ai_suggestions():
    """Get AI-powered business suggestions"""
    if not EMERGENT_LLM_KEY:
        return {"suggestions": ["Configure AI to get personalized suggestions"]}
    
    # Get data for analysis
    total_customers = await db.customers.count_documents({})
    new_leads = await db.leads.count_documents({"status": "New"})
    pending_complaints = await db.complaints.count_documents({"status": "Pending"})
    
    suggestions = []
    
    if new_leads > 5:
        suggestions.append(f"You have {new_leads} new leads to follow up on today!")
    
    if pending_complaints > 3:
        suggestions.append(f"{pending_complaints} complaints are pending - consider prioritizing service calls")
    
    if total_customers > 0 and total_customers % 50 == 0:
        suggestions.append("Great milestone! Consider running a promotional campaign for your growing customer base")
    
    if not suggestions:
        suggestions = ["All caught up! Consider reaching out to inactive customers", "Great time to plan your next marketing campaign"]
    
    return {"suggestions": suggestions}

# ============ PERSONAL JARVIS ASSISTANT ============

class JarvisMessage(BaseModel):
    message: str
    context: Optional[str] = "store_owner"

class JarvisResponse(BaseModel):
    response: str
    action: Optional[str] = None
    action_data: Optional[dict] = None

# Store owner context for personalized responses
owner_context = {
    "name": "Sir",
    "vocabulary": [],
    "preferences": {},
    "conversation_history": []
}

@api_router.post("/ai/jarvis-assistant", response_model=JarvisResponse)
async def jarvis_assistant(input: JarvisMessage):
    """Personal Jarvis AI Assistant for Store Owner - Like Iron Man's Jarvis"""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="AI features not configured")
    
    # Get current store context
    total_customers = await db.customers.count_documents({})
    total_leads = await db.leads.count_documents({})
    new_leads = await db.leads.count_documents({"status": "New"})
    pending_complaints = await db.complaints.count_documents({"status": "Pending"})
    pending_approvals = await db.approvals.count_documents({"status": "pending"})
    
    # Get recent leads
    recent_leads = await db.leads.find().sort("created_at", -1).limit(5).to_list(5)
    recent_leads_info = "\n".join([
        f"- {l.get('customer_name')}: interested in {l.get('product_interested')} ({l.get('status')})"
        for l in recent_leads
    ])
    
    # Get pending complaints
    pending_complaints_list = await db.complaints.find({"status": "Pending"}).limit(5).to_list(5)
    complaints_info = "\n".join([
        f"- {c.get('customer_name', c.get('customer_phone'))}: {c.get('brand')} {c.get('product_type')} - {c.get('issue_description')[:50]}..."
        for c in pending_complaints_list
    ])
    
    # Get products for context
    products = await db.products.find({"in_stock": True}).to_list(20)
    products_info = "\n".join([
        f"- {p.get('name')} ({p.get('brand')}): ₹{p.get('base_price')} (min: ₹{p.get('min_price')})"
        for p in products
    ])
    
    system_prompt = f"""You are JARVIS, a highly intelligent personal AI assistant for the owner of Walia Brothers Electronics Store in Punjab, India. 
Your personality is like Tony Stark's JARVIS - intelligent, helpful, formal yet warm, and always addresses the user as "Sir".

STORE STATUS RIGHT NOW:
- Total Customers: {total_customers}
- Total Leads: {total_leads}
- New Leads Pending Follow-up: {new_leads}
- Pending Complaints: {pending_complaints}
- AI Approvals Waiting: {pending_approvals}

RECENT LEADS:
{recent_leads_info if recent_leads else "No recent leads"}

PENDING COMPLAINTS:
{complaints_info if pending_complaints_list else "No pending complaints"}

PRODUCTS IN INVENTORY:
{products_info if products else "No products in database yet"}

YOUR CAPABILITIES:
1. Provide business insights and summaries
2. Help manage leads and complaints
3. Suggest marketing strategies
4. Answer questions about store operations
5. Navigate to different sections of the app
6. Create leads and complaints on command

RESPONSE GUIDELINES:
- Always address user as "Sir"
- Be professional yet warm like Iron Man's JARVIS
- Keep responses concise but informative
- Use Hindi phrases naturally when appropriate (e.g., "Ji Sir", "Bilkul Sir")
- If asked to do something, confirm the action
- For navigation requests, include action in response

ACTIONS YOU CAN TRIGGER (include in JSON if needed):
- navigate: {{"screen": "/leads"}} or "/complaints" or "/customers" or "/marketing" or "/approvals"
- create_lead: Will navigate to leads screen
- create_complaint: Will navigate to complaints screen

Respond in this JSON format:
{{
    "response": "Your helpful response here",
    "action": "action_name or null",
    "action_data": {{"key": "value"}} or null
}}
"""

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"jarvis-owner-{uuid.uuid4()}",
            system_message=system_prompt
        ).with_model("openai", "gpt-4o")
        
        response_text = await chat.send_message(UserMessage(text=input.message))
        
        # Parse JSON response
        import json
        try:
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            if json_match:
                ai_response = json.loads(json_match.group())
                return JarvisResponse(
                    response=ai_response.get("response", response_text),
                    action=ai_response.get("action"),
                    action_data=ai_response.get("action_data")
                )
        except json.JSONDecodeError:
            pass
        
        return JarvisResponse(response=response_text)
        
    except Exception as e:
        logging.error(f"Jarvis error: {str(e)}")
        return JarvisResponse(
            response="I apologize Sir, I'm experiencing a temporary issue. Please try again in a moment."
        )

@api_router.get("/ai/daily-brief")
async def get_daily_brief():
    """Get daily brief for store owner"""
    total_customers = await db.customers.count_documents({})
    total_leads = await db.leads.count_documents({})
    new_leads = await db.leads.count_documents({"status": "New"})
    pending_complaints = await db.complaints.count_documents({"status": "Pending"})
    pending_approvals = await db.approvals.count_documents({"status": "pending"})
    
    # Get repeated complaints (same brand/product)
    complaint_pipeline = [
        {"$group": {"_id": {"brand": "$brand", "product_type": "$product_type"}, "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 3}
    ]
    repeated_complaints = await db.complaints.aggregate(complaint_pipeline).to_list(3)
    
    # Get product demand (from leads)
    demand_pipeline = [
        {"$group": {"_id": "$product_interested", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5}
    ]
    product_demand = await db.leads.aggregate(demand_pipeline).to_list(5)
    
    critical_alerts = []
    suggestions = []
    
    if pending_complaints > 3:
        critical_alerts.append(f"{pending_complaints} complaints pending - customers waiting!")
    if pending_approvals > 0:
        critical_alerts.append(f"{pending_approvals} AI responses waiting for your approval")
    if new_leads > 5:
        critical_alerts.append(f"{new_leads} hot leads need immediate follow-up")
    
    for rc in repeated_complaints:
        brand = rc["_id"].get("brand", "Unknown")
        product = rc["_id"].get("product_type", "Unknown")
        count = rc["count"]
        suggestions.append(f"Multiple complaints ({count}) for {brand} {product} - consider contacting service center")
    
    for pd in product_demand:
        product = pd["_id"]
        count = pd["count"]
        if count > 2:
            suggestions.append(f"High demand for {product} ({count} inquiries) - ensure stock availability")
    
    if not suggestions:
        suggestions.append("Business running smoothly - great time to plan promotions")
    
    return {
        "total_customers": total_customers,
        "total_leads": total_leads,
        "new_leads": new_leads,
        "pending_complaints": pending_complaints,
        "pending_approvals": pending_approvals,
        "critical_alerts": critical_alerts,
        "suggestions": suggestions,
        "repeated_complaints": repeated_complaints,
        "product_demand": product_demand
    }

# ============ JARVIS COMMAND EXECUTION ============

class JarvisCommand(BaseModel):
    command: str
    session_id: Optional[str] = "default"

# Jarvis conversation model for sync
class JarvisConversation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str = "default"
    messages: List[dict] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

@api_router.get("/jarvis/conversation/{session_id}")
async def get_jarvis_conversation(session_id: str = "default"):
    """Get synced Jarvis conversation history"""
    conversation = await db.jarvis_conversations.find_one({"session_id": session_id})
    if conversation:
        return {
            "session_id": session_id,
            "messages": conversation.get("messages", []),
            "synced": True
        }
    return {"session_id": session_id, "messages": [], "synced": True}

@api_router.delete("/jarvis/conversation/{session_id}")
async def clear_jarvis_conversation(session_id: str = "default"):
    """Clear Jarvis conversation history"""
    await db.jarvis_conversations.delete_one({"session_id": session_id})
    return {"message": "Conversation cleared", "session_id": session_id}

@api_router.post("/ai/jarvis-command")
async def jarvis_execute_command(input: JarvisCommand):
    """
    Jarvis Command Executor - Smart, decisive, multi-domain assistant
    Syncs across all devices (phone, PC, tablet)
    """
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="AI not configured")
    
    command = input.command.strip()
    session_id = input.session_id or "default"
    
    # Get conversation history for context
    conversation = await db.jarvis_conversations.find_one({"session_id": session_id})
    conversation_history = conversation.get("messages", [])[-10:] if conversation else []
    
    # Get LIVE WEATHER
    weather_data = await get_weather()
    weather_temp = weather_data.get("temperature", 25)
    weather_condition = weather_data.get("condition", "Clear")
    weather_location = weather_data.get("location", "Punjab")
    
    # Get current store data for context
    products = await db.products.find().to_list(100)
    leads = await db.leads.find().sort("created_at", -1).limit(20).to_list(20)
    complaints = await db.complaints.find().sort("created_at", -1).limit(20).to_list(20)
    customers = await db.customers.find().to_list(100)
    
    # Get stats
    total_customers = await db.customers.count_documents({})
    total_leads = await db.leads.count_documents({})
    new_leads = await db.leads.count_documents({"status": "New"})
    pending_complaints = await db.complaints.count_documents({"status": "Pending"})
    pending_marketing = await db.marketing_suggestions.count_documents({"status": "pending_approval"})
    
    products_info = "\n".join([
        f"• {p.get('name')} ({p.get('brand')}) - Base: ₹{p.get('base_price')}, Min: ₹{p.get('min_price')}, ID: {p.get('id')}"
        for p in products
    ]) if products else "No products in inventory"
    
    leads_info = "\n".join([
        f"• {l.get('customer_name')} ({l.get('phone')}) - wants {l.get('product_interested')}, budget {l.get('budget_range')}, status: {l.get('status')}, ID: {l.get('id')}"
        for l in leads
    ]) if leads else "No leads"
    
    complaints_info = "\n".join([
        f"• {c.get('customer_name', 'Unknown')} ({c.get('customer_phone')}) - {c.get('brand')} {c.get('product_type')}: {c.get('issue_description', '')[:50]}..., status: {c.get('status')}, ID: {c.get('id')}"
        for c in complaints
    ]) if complaints else "No complaints"
    
    # Get market trends/alerts
    market_alerts = await db.market_alerts.find({"status": "pending_review"}).limit(5).to_list(5)
    market_alerts_info = "\n".join([
        f"⚠️ {a.get('trigger')}: {a.get('suggestion')} (Products: {', '.join(a.get('products', []))})"
        for a in market_alerts
    ]) if market_alerts else "No market alerts"
    
    # Build conversation context
    conv_context = ""
    if conversation_history:
        conv_context = "\n## RECENT CONVERSATION:\n"
        for msg in conversation_history[-5:]:
            role = "Sir" if msg.get("role") == "user" else "JARVIS"
            conv_context += f"{role}: {msg.get('content', '')[:100]}...\n"
    
    system_prompt = f"""You are JARVIS - Just A Rather Very Intelligent System. You are a highly intelligent, multi-domain AI assistant.

## YOUR IDENTITY:
- You are like Tony Stark's JARVIS - intelligent, witty, efficient, and deeply knowledgeable
- Always address the owner as "Sir"
- You are synced across ALL devices - phone, PC, tablet - same conversation everywhere
- Be brief but thorough when explaining technical topics

## 🗣️ LANGUAGE RULES (VERY IMPORTANT):
**For OWNER (Sir) - Always respond in ENGLISH**
- All reports, summaries, stats in English
- Use Hindi/Punjabi phrases only for warmth: "Ji Sir", "Bilkul", "Sat Sri Akal"

**For CUSTOMERS (on calls/WhatsApp) - Respond in THEIR language:**
- If customer speaks Punjabi → Reply in Punjabi
- If customer speaks Hindi → Reply in Hindi
- If customer speaks English → Reply in English
- Detect language from their message and match it

**Punjabi Phrases You Know:**
- ਸਤ ਸ੍ਰੀ ਅਕਾਲ (Sat Sri Akal) - Hello/Greeting
- ਕੀ ਹਾਲ ਹੈ? (Ki haal hai?) - How are you?
- ਜੀ ਆਇਆਂ ਨੂੰ (Ji aayian nu) - Welcome
- ਧੰਨਵਾਦ (Dhanvaad) - Thank you
- ਕਿੰਨੇ ਦਾ ਹੈ? (Kinne da hai?) - What's the price?
- ਬਿਲਕੁਲ ਜੀ (Bilkul ji) - Absolutely
- ਠੀਕ ਹੈ ਜੀ (Theek hai ji) - Okay
- ਫ਼ਿਕਰ ਨਾ ਕਰੋ (Fikar na karo) - Don't worry
- ਅਸੀਂ ਮਦਦ ਕਰਾਂਗੇ (Assi madad karange) - We will help

**Hindi Phrases You Know:**
- नमस्ते (Namaste) - Hello
- कैसे हैं आप? (Kaise hain aap?) - How are you?
- धन्यवाद (Dhanyavaad) - Thank you
- कितने का है? (Kitne ka hai?) - What's the price?
- बिल्कुल जी (Bilkul ji) - Absolutely
- चिंता मत करो (Chinta mat karo) - Don't worry
- हम मदद करेंगे (Hum madad karenge) - We will help

## LIVE WEATHER NOW:
🌡️ {weather_location}: {weather_temp}°C, {weather_condition}
Use this to make smart marketing suggestions!

## WEATHER-BASED MARKETING INTELLIGENCE:
- Hot weather (>35°C): Promote ACs, coolers, refrigerators, fans
- Cold weather (<15°C): Promote heaters, geysers, ovens, induction cooktops, washer-dryers
- Rainy weather: Stock washing machines, dryers, water heaters
- If you suggest marketing actions, ALWAYS ask for approval first

## 📰 LIVE MARKET ALERTS (from Google News):
{market_alerts_info}

## MARKET TREND AWARENESS:
You monitor Google News for market trends:
- LPG price hike → Suggest stocking induction cooktops and air fryers
- Copper price hike → Suggest stocking ACs early (copper is major AC component)
- Electricity rate changes → Suggest energy-efficient 5-star appliances
- Festival seasons → Suggest promotional campaigns

## WHAT YOU CAN DO FOR SIR (Capabilities):
When asked "what can you do?", explain these:

📦 **Store Management:**
- Update product prices instantly
- Add new products to inventory
- Create and manage customer leads
- Register and track service complaints
- View store statistics and reports

📰 **Market Intelligence:**
- Monitor Google News for market trends (LPG, copper, electricity prices)
- Alert you when prices change that affect your products
- Suggest stock adjustments based on market conditions

🌤️ **Smart Marketing:**
- Monitor live weather for {weather_location}
- Suggest products based on weather conditions
- Plan marketing campaigns (with your approval)
- Recommend stock adjustments based on trends

📱 **Tech Support:**
- Android troubleshooting and tips
- Windows 10/11 help and optimization
- WiFi, printer, and device setup
- Software recommendations

🔄 **Sync & Automation:**
- Synced across all your devices (phone, PC, tablet)
- Remember our conversations
- Provide daily business briefs
- Alert you about pending tasks

🔮 **Coming Soon:**
- Busy accounting software integration
- Twitter/X trend monitoring for market insights
- Automated customer notifications
- Voice calls and WhatsApp via Exotel

## YOUR KNOWLEDGE DOMAINS:

### 1. STORE MANAGEMENT (Primary)
Walia Brothers Electronics Store:
- Stats: {total_customers} customers, {total_leads} leads ({new_leads} new), {pending_complaints} pending complaints, {pending_marketing} pending marketing tasks
- Products: {products_info}
- Leads: {leads_info}
- Complaints: {complaints_info}

### 2. ANDROID OS EXPERTISE
- Troubleshooting: App crashes, battery drain, storage issues, slow performance
- Settings: Developer options, accessibility, privacy, security
- Recovery: Factory reset, safe mode, clearing cache partition
- ADB commands, Play Store fixes, WiFi/Bluetooth issues

### 3. WINDOWS OS EXPERTISE  
- Troubleshooting: Blue screen, slow boot, driver issues
- Performance: Disk cleanup, defrag, startup optimization, RAM management
- Security: Windows Defender, firewall, malware removal
- CMD/PowerShell commands, registry tweaks

### 4. GENERAL TECH SUPPORT
- WiFi/Network troubleshooting
- Printer setup and issues
- Data backup and recovery

{conv_context}

## STORE ACTIONS (use JSON format):
1. UPDATE PRICE: {{"action": "update_price", "action_data": {{"product_id": "ID", "base_price": NUM, "min_price": NUM}}}}
2. CREATE LEAD: {{"action": "create_lead", "action_data": {{"customer_name": "NAME", "phone": "NUM", "product_interested": "PRODUCT"}}}}
3. CREATE COMPLAINT: {{"action": "create_complaint", "action_data": {{"customer_name": "NAME", "phone": "NUM", "brand": "BRAND", "product_type": "TYPE", "issue": "DESC"}}}}
4. ADD PRODUCT: {{"action": "add_product", "action_data": {{"name": "NAME", "brand": "BRAND", "category": "CAT", "base_price": NUM, "min_price": NUM}}}}
5. NAVIGATE: {{"action": "navigate", "navigate_to": "/leads" or "/complaints" or "/customers"}}
6. MARKETING SUGGESTION: {{"action": "marketing_suggestion", "action_data": {{"type": "promotion/stock_alert", "products": ["list"], "reason": "why"}}}}

## RESPONSE FORMAT:
```json
{{
    "response": "Your helpful response",
    "action": "action_name or null",
    "action_data": {{}},
    "navigate_to": null
}}
```

## SMART BEHAVIORS:
1. For store commands - take action immediately
2. For tech questions - give clear, step-by-step guidance
3. For troubleshooting - ask clarifying questions if needed, then provide solutions
4. Remember conversation context - refer to previous messages when relevant
5. Use Hindi phrases naturally: "Ji Sir", "Bilkul", "Ho gaya"
6. Be concise for simple queries, detailed for complex technical help"""

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"jarvis-smart-{uuid.uuid4()}",
            system_message=system_prompt
        ).with_model("openai", "gpt-4o")
        
        response_text = await chat.send_message(UserMessage(text=command))
        
        # Parse JSON response
        import json
        ai_response = {"response": response_text, "action": None, "action_data": {}, "navigate_to": None}
        
        try:
            # Find JSON in response
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            if json_match:
                parsed = json.loads(json_match.group())
                ai_response = {
                    "response": parsed.get("response", response_text),
                    "action": parsed.get("action"),
                    "action_data": parsed.get("action_data", {}),
                    "navigate_to": parsed.get("navigate_to")
                }
        except json.JSONDecodeError:
            # If JSON parsing fails, use raw response
            pass
        
        action = ai_response.get("action")
        action_data = ai_response.get("action_data") or {}
        response_msg = ai_response.get("response", "Done Sir.")
        navigate_to = ai_response.get("navigate_to")
        
        # EXECUTE THE ACTION
        action_result = None
        
        if action == "update_price":
            product_id = action_data.get("product_id")
            base_price = action_data.get("base_price")
            min_price = action_data.get("min_price")
            
            if product_id:
                update_data = {}
                if base_price is not None:
                    update_data["base_price"] = float(base_price)
                if min_price is not None:
                    update_data["min_price"] = float(min_price)
                
                if update_data:
                    result = await db.products.update_one({"id": product_id}, {"$set": update_data})
                    if result.modified_count > 0:
                        action_result = "price_updated"
        
        elif action == "create_lead":
            lead_data = {
                "customer_name": action_data.get("customer_name", "Unknown"),
                "phone": action_data.get("phone", "Not provided"),
                "product_interested": action_data.get("product_interested", "General inquiry"),
                "budget_range": action_data.get("budget", "Not specified"),
                "status": "New",
                "notes": "Created by Jarvis",
                "city": action_data.get("city", "")
            }
            lead = Lead(**lead_data)
            await db.leads.insert_one(lead.dict())
            action_result = "lead_created"
        
        elif action == "update_lead":
            lead_id = action_data.get("lead_id")
            status = action_data.get("status")
            if lead_id and status:
                await db.leads.update_one({"id": lead_id}, {"$set": {"status": status, "updated_at": datetime.utcnow()}})
                action_result = "lead_updated"
        
        elif action == "create_complaint":
            complaint_data = {
                "customer_name": action_data.get("customer_name", "Unknown"),
                "customer_phone": action_data.get("phone", "Not provided"),
                "brand": action_data.get("brand", "Unknown"),
                "product_type": action_data.get("product_type", "Unknown"),
                "issue_description": action_data.get("issue", "Service required"),
                "status": "Pending"
            }
            complaint = Complaint(**complaint_data)
            await db.complaints.insert_one(complaint.dict())
            action_result = "complaint_created"
        
        elif action == "update_complaint":
            complaint_id = action_data.get("complaint_id")
            status = action_data.get("status")
            if complaint_id and status:
                await db.complaints.update_one({"id": complaint_id}, {"$set": {"status": status, "updated_at": datetime.utcnow()}})
                action_result = "complaint_updated"
        
        elif action == "add_product":
            product_data = {
                "name": action_data.get("name", "New Product"),
                "brand": action_data.get("brand", "Generic"),
                "category": action_data.get("category", "Other"),
                "base_price": float(action_data.get("base_price", 0)),
                "min_price": float(action_data.get("min_price", action_data.get("base_price", 0))),
                "max_discount": action_data.get("max_discount", 10),
                "description": action_data.get("description", ""),
                "in_stock": True
            }
            product = Product(**product_data)
            await db.products.insert_one(product.dict())
            action_result = "product_added"
        
        elif action == "navigate":
            action_result = "navigating"
        
        # Save conversation to database for sync across devices
        new_messages = [
            {"role": "user", "content": command, "timestamp": datetime.utcnow().isoformat()},
            {"role": "jarvis", "content": response_msg, "timestamp": datetime.utcnow().isoformat(), "action": action_result}
        ]
        
        await db.jarvis_conversations.update_one(
            {"session_id": session_id},
            {
                "$push": {"messages": {"$each": new_messages}},
                "$set": {"updated_at": datetime.utcnow()},
                "$setOnInsert": {"created_at": datetime.utcnow()}
            },
            upsert=True
        )
        
        return {
            "response": response_msg,
            "action": action_result or action,
            "action_data": action_data,
            "navigate_to": navigate_to,
            "session_id": session_id,
            "synced": True
        }
        
    except Exception as e:
        logging.error(f"Jarvis error: {str(e)}")
        return {
            "response": f"Sir, I encountered an issue: {str(e)[:100]}. Please try again.",
            "action": None,
            "action_data": None,
            "navigate_to": None
        }

# ============ AI CUSTOMER ASSISTANT ============

class CustomerChatMessage(BaseModel):
    message: str
    customer_name: Optional[str] = ""
    customer_phone: Optional[str] = ""
    session_id: Optional[str] = ""

class CustomerChatResponse(BaseModel):
    response: str
    action_taken: Optional[str] = None
    lead_created: Optional[dict] = None
    complaint_created: Optional[dict] = None
    needs_info: Optional[List[str]] = None

# Store conversation context
customer_sessions = {}

@api_router.post("/ai/customer-chat", response_model=CustomerChatResponse)
async def customer_chat(input: CustomerChatMessage):
    """AI Customer Assistant - Handles customer inquiries in Punjabi/Hindi/English, creates leads and complaints"""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="AI features not configured")
    
    session_id = input.session_id or str(uuid.uuid4())
    
    # Get or create session context
    if session_id not in customer_sessions:
        customer_sessions[session_id] = {
            "customer_name": input.customer_name,
            "customer_phone": input.customer_phone,
            "conversation": [],
            "intent": None,
            "collected_info": {},
            "language": "auto"  # Will auto-detect
        }
    
    session = customer_sessions[session_id]
    
    # Update session with any new info
    if input.customer_name:
        session["customer_name"] = input.customer_name
    if input.customer_phone:
        session["customer_phone"] = input.customer_phone
    
    # Add message to conversation
    session["conversation"].append({"role": "customer", "message": input.message})
    
    # Get available products/brands for context
    brands_list = await db.brand_whatsapp.find().to_list(20)
    available_brands = [b.get("brand_name") for b in brands_list]
    
    # Get products for pricing info
    products = await db.products.find().to_list(50)
    products_info = "\n".join([
        f"- {p.get('name')} ({p.get('brand')}): ₹{p.get('base_price')} (can go down to ₹{p.get('min_price')})"
        for p in products
    ]) if products else "Contact store for prices"
    
    system_prompt = f"""You are JARVIS, the AI customer assistant for Walia Brothers Electronics Store in Ludhiana, Punjab, India.

## 🗣️ LANGUAGE DETECTION - CRITICAL:
**Detect customer's language from their message and REPLY IN SAME LANGUAGE:**
- If Punjabi (ਪੰਜਾਬੀ) → Reply in Punjabi
- If Hindi (हिंदी) → Reply in Hindi  
- If English → Reply in English
- If mixed (Hinglish/Punglish) → Reply in same mix

## PUNJABI RESPONSES (Use when customer speaks Punjabi):
- ਸਤ ਸ੍ਰੀ ਅਕਾਲ ਜੀ! ਵਾਲੀਆ ਬ੍ਰਦਰਜ਼ ਵਿੱਚ ਤੁਹਾਡਾ ਸਵਾਗਤ ਹੈ।
- ਜੀ, ਕੀ ਮੈਂ ਤੁਹਾਡੀ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ?
- ਬਿਲਕੁਲ ਜੀ, ਇਹ [product] ਦੀ ਕੀਮਤ ₹X ਹੈ
- ਤੁਹਾਡਾ ਨਾਮ ਦੱਸੋ ਜੀ
- ਤੁਹਾਡਾ ਫ਼ੋਨ ਨੰਬਰ ਕੀ ਹੈ?
- ਠੀਕ ਹੈ ਜੀ, ਮੈਂ ਤੁਹਾਡੀ ਸ਼ਿਕਾਇਤ ਦਰਜ ਕਰ ਦਿੱਤੀ ਹੈ
- ਸਾਡਾ ਸਰਵਿਸ ਟੀਮ ਜਲਦੀ ਸੰਪਰਕ ਕਰੇਗੀ

## HINDI RESPONSES (Use when customer speaks Hindi):
- नमस्ते जी! वालिया ब्रदर्स में आपका स्वागत है।
- जी, क्या मैं आपकी मदद कर सकता हूं?
- बिल्कुल जी, इस [product] की कीमत ₹X है
- आपका नाम बताइए जी
- आपका फ़ोन नंबर क्या है?
- ठीक है जी, मैंने आपकी शिकायत दर्ज कर दी है
- हमारी सर्विस टीम जल्द संपर्क करेगी

## STORE INFO:
- We sell TVs, ACs, Refrigerators, Washing Machines, Microwaves and other electronics
- Brands: {', '.join(available_brands) if available_brands else 'LG, Samsung, Sony, Whirlpool, Panasonic, Haier, Lloyd, Blue Star, Voltas'}
- Location: Ludhiana, Punjab

## PRODUCT PRICES:
{products_info}

## YOUR TASKS:
1. Greet customers warmly IN THEIR LANGUAGE
2. Understand if customer wants to:
   - BUY a product → Collect: name, phone, product interest, budget → CREATE LEAD
   - COMPLAIN about a product → Collect: name, phone, product type, brand, issue → CREATE COMPLAINT
   - ASK price → Give price from product list above
   - General questions → Answer helpfully

## RESPONSE FORMAT:
Always respond in this JSON format:
{{
    "reply": "Your response IN CUSTOMER'S LANGUAGE",
    "reply_english": "Same response in English (for owner's record)",
    "detected_language": "punjabi" or "hindi" or "english",
    "intent": "inquiry" or "complaint" or "general" or "greeting",
    "ready_to_create": true or false,
    "missing_info": ["list of missing required fields"],
    "collected_data": {{
        "customer_name": "if mentioned",
        "customer_phone": "if mentioned",
        "product_interested": "if buying",
        "brand": "if mentioned",
        "budget": "if mentioned",
        "product_type": "if complaint",
        "issue_description": "if complaint",
        "city": "if mentioned"
    }}
}}

## RULES:
- ALWAYS reply in customer's language
- Be warm and respectful (use ਜੀ / जी often)
- When giving prices, give range (base to min price)
- For leads: Need at minimum - name, phone, product interest
- For complaints: Need at minimum - name, phone, product type, brand, issue description
- Ask for missing info naturally in conversation
- When you have all required info, set ready_to_create to true
- Keep responses concise but helpful

Current customer info:
- Name: {session.get('customer_name') or 'Not provided yet'}
- Phone: {session.get('customer_phone') or 'Not provided yet'}
- Previously collected: {session.get('collected_info', {})}

Conversation so far:
{chr(10).join([f"{'Customer' if m['role']=='customer' else 'Assistant'}: {m['message']}" for m in session['conversation'][-5:]])}
"""
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"customer-{session_id}",
            system_message=system_prompt
        ).with_model("openai", "gpt-4o")
        
        response_text = await chat.send_message(UserMessage(text=input.message))
        
        # Parse the AI response
        import json
        try:
            # Try to extract JSON from response
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            if json_match:
                ai_response = json.loads(json_match.group())
            else:
                ai_response = {"reply": response_text, "intent": "general", "ready_to_create": False}
        except json.JSONDecodeError:
            ai_response = {"reply": response_text, "intent": "general", "ready_to_create": False}
        
        reply = ai_response.get("reply", response_text)
        intent = ai_response.get("intent", "general")
        ready_to_create = ai_response.get("ready_to_create", False)
        collected_data = ai_response.get("collected_data", {})
        missing_info = ai_response.get("missing_info", [])
        
        # Update session with collected data
        session["intent"] = intent
        for key, value in collected_data.items():
            if value and value != "Not provided yet":
                session["collected_info"][key] = value
        
        # Add assistant response to conversation
        session["conversation"].append({"role": "assistant", "message": reply})
        
        response = CustomerChatResponse(
            response=reply,
            action_taken=None,
            lead_created=None,
            complaint_created=None,
            needs_info=missing_info if missing_info else None
        )
        
        # Create lead or complaint if ready
        if ready_to_create:
            info = session["collected_info"]
            
            if intent == "inquiry" and info.get("customer_name") and info.get("customer_phone") and info.get("product_interested"):
                # Create Lead
                lead_data = {
                    "customer_name": info.get("customer_name"),
                    "phone": info.get("customer_phone"),
                    "city": info.get("city", ""),
                    "product_interested": info.get("product_interested"),
                    "model_number": info.get("model_number", ""),
                    "budget_range": info.get("budget", ""),
                    "notes": f"Created by AI Assistant. Conversation summary: Customer inquired about {info.get('product_interested')}",
                    "status": "New"
                }
                lead = Lead(**lead_data)
                await db.leads.insert_one(lead.dict())
                
                response.action_taken = "lead_created"
                response.lead_created = {"id": lead.id, "customer_name": lead.customer_name, "product": lead.product_interested}
                
                # Notify message
                response.response = reply + f"\n\n✅ I've recorded your interest! Our team will contact you shortly with the best deals on {info.get('product_interested')}."
                
            elif intent == "complaint" and info.get("customer_name") and info.get("customer_phone") and info.get("product_type") and info.get("brand") and info.get("issue_description"):
                # Create Complaint
                complaint_data = {
                    "customer_phone": info.get("customer_phone"),
                    "customer_name": info.get("customer_name"),
                    "product_type": info.get("product_type"),
                    "brand": info.get("brand"),
                    "purchase_date": info.get("purchase_date", ""),
                    "product_size": info.get("product_size", ""),
                    "issue_description": info.get("issue_description"),
                    "status": "Pending"
                }
                complaint = Complaint(**complaint_data)
                await db.complaints.insert_one(complaint.dict())
                
                response.action_taken = "complaint_created"
                response.complaint_created = {"id": complaint.id, "customer_name": complaint.customer_name, "brand": complaint.brand, "issue": complaint.issue_description}
                
                response.response = reply + f"\n\n✅ Your complaint has been registered! Our service team will contact you soon regarding your {info.get('brand')} {info.get('product_type')} issue."
        
        return response
        
    except Exception as e:
        logging.error(f"Customer chat error: {str(e)}")
        return CustomerChatResponse(
            response="I apologize, but I'm having trouble processing your request. Please call our store directly or try again.",
            action_taken=None
        )

@api_router.get("/ai/customer-sessions")
async def get_customer_sessions():
    """Get list of active customer chat sessions with their status"""
    sessions_list = []
    for session_id, session in customer_sessions.items():
        sessions_list.append({
            "session_id": session_id,
            "customer_name": session.get("customer_name", "Unknown"),
            "customer_phone": session.get("customer_phone", ""),
            "intent": session.get("intent", "unknown"),
            "message_count": len(session.get("conversation", [])),
            "collected_info": session.get("collected_info", {})
        })
    return {"sessions": sessions_list}

@api_router.delete("/ai/customer-sessions/{session_id}")
async def clear_customer_session(session_id: str):
    """Clear a customer chat session"""
    if session_id in customer_sessions:
        del customer_sessions[session_id]
        return {"success": True, "message": "Session cleared"}
    raise HTTPException(status_code=404, detail="Session not found")

# ============ NOTIFICATIONS ============

@api_router.get("/notifications")
async def get_notifications():
    """Get pending notifications for store owner"""
    notifications = []
    
    # New leads
    new_leads = await db.leads.find({"status": "New"}).sort("created_at", -1).limit(5).to_list(5)
    for lead in new_leads:
        notifications.append({
            "type": "new_lead",
            "title": f"New Lead: {lead.get('customer_name')}",
            "message": f"Interested in {lead.get('product_interested')}",
            "phone": lead.get("phone"),
            "id": lead.get("id"),
            "created_at": lead.get("created_at")
        })
    
    # Pending complaints
    pending = await db.complaints.find({"status": "Pending"}).sort("created_at", -1).limit(5).to_list(5)
    for complaint in pending:
        notifications.append({
            "type": "pending_complaint",
            "title": f"Complaint: {complaint.get('customer_name', complaint.get('customer_phone'))}",
            "message": f"{complaint.get('brand')} {complaint.get('product_type')} - {complaint.get('issue_description')[:50]}...",
            "phone": complaint.get("customer_phone"),
            "id": complaint.get("id"),
            "created_at": complaint.get("created_at")
        })
    
    # Sort by created_at
    notifications.sort(key=lambda x: x.get("created_at", datetime.min), reverse=True)
    
    return {"notifications": notifications[:10], "total_new_leads": len(new_leads), "total_pending_complaints": len(pending)}

# ============ SETTINGS ============

@api_router.get("/settings")
async def get_settings():
    settings = await db.settings.find_one({"type": "app_settings"})
    if not settings:
        default_settings = {
            "type": "app_settings",
            "pin": "1234",
            "store_name": "Walia Brothers",
            "store_phone": "",
            "store_address": ""
        }
        await db.settings.insert_one(default_settings)
        return default_settings
    # Remove MongoDB _id to avoid serialization issues
    if "_id" in settings:
        del settings["_id"]
    return settings

@api_router.put("/settings")
async def update_settings(store_name: Optional[str] = None, store_phone: Optional[str] = None, store_address: Optional[str] = None):
    update_data = {}
    if store_name:
        update_data["store_name"] = store_name
    if store_phone:
        update_data["store_phone"] = store_phone
    if store_address:
        update_data["store_address"] = store_address
    
    await db.settings.update_one(
        {"type": "app_settings"},
        {"$set": update_data},
        upsert=True
    )
    return {"success": True}

# ============ EXOTEL INTEGRATION ============

class ExotelCallLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    call_sid: str
    from_number: str
    to_number: str
    direction: str  # incoming, outgoing
    status: str
    duration: int = 0
    recording_url: Optional[str] = None
    ai_transcript: Optional[str] = None
    ai_response: Optional[str] = None
    lead_created: Optional[str] = None
    complaint_created: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class WhatsAppMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    from_number: str
    to_number: str
    message: str
    direction: str  # incoming, outgoing
    status: str = "received"
    ai_response: Optional[str] = None
    requires_approval: bool = False
    approved: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

# Exotel helper function
async def make_exotel_request(endpoint: str, method: str = "GET", data: dict = None):
    """Make authenticated request to Exotel API"""
    if not EXOTEL_API_KEY or not EXOTEL_API_TOKEN:
        raise HTTPException(status_code=500, detail="Exotel not configured")
    
    # Exotel uses Basic Auth
    auth_string = base64.b64encode(f"{EXOTEL_API_KEY}:{EXOTEL_API_TOKEN}".encode()).decode()
    
    url = f"https://{EXOTEL_SUBDOMAIN}/v1/Accounts/{EXOTEL_SID}/{endpoint}"
    
    headers = {
        "Authorization": f"Basic {auth_string}",
        "Content-Type": "application/x-www-form-urlencoded"
    }
    
    async with httpx.AsyncClient() as client:
        if method == "GET":
            response = await client.get(url, headers=headers)
        else:
            response = await client.post(url, headers=headers, data=data)
        
        return response

@api_router.get("/exotel/status")
async def exotel_status():
    """Check Exotel connection status"""
    if not EXOTEL_API_KEY:
        return {"connected": False, "message": "Exotel API key not configured"}
    
    return {
        "connected": True,
        "api_key_set": bool(EXOTEL_API_KEY),
        "api_token_set": bool(EXOTEL_API_TOKEN),
        "subdomain": EXOTEL_SUBDOMAIN
    }

@api_router.post("/exotel/webhook/call")
async def exotel_call_webhook(request: Request):
    """Webhook for incoming Exotel calls - This URL needs to be set in Exotel dashboard"""
    try:
        # Parse form data from Exotel
        form_data = await request.form()
        
        call_sid = form_data.get("CallSid", "")
        from_number = form_data.get("From", "")
        to_number = form_data.get("To", "")
        direction = form_data.get("Direction", "incoming")
        status = form_data.get("Status", "")
        
        # Log the call
        call_log = ExotelCallLog(
            call_sid=call_sid,
            from_number=from_number,
            to_number=to_number,
            direction=direction,
            status=status
        )
        await db.call_logs.insert_one(call_log.dict())
        
        # If it's a new incoming call, prepare AI response
        if status == "ringing" and direction == "incoming":
            # Get store info for AI context
            training_context = await get_ai_training_context()
            
            # Create greeting message
            greeting = "Sat Sri Akal! Welcome to Walia Brothers Electronics. How can I help you today?"
            
            # Return TwiML-like response for Exotel IVR
            # Note: Exotel uses different format, this is a placeholder
            return {
                "action": "speak",
                "text": greeting,
                "call_sid": call_sid
            }
        
        return {"status": "received", "call_sid": call_sid}
        
    except Exception as e:
        logging.error(f"Exotel webhook error: {str(e)}")
        return {"status": "error", "message": str(e)}

@api_router.post("/exotel/webhook/whatsapp")
async def exotel_whatsapp_webhook(request: Request):
    """Webhook for incoming WhatsApp messages via Exotel"""
    try:
        form_data = await request.form()
        
        from_number = form_data.get("From", "")
        to_number = form_data.get("To", "")
        message_body = form_data.get("Body", "")
        
        # Clean phone number
        from_number = re.sub(r'[^\d]', '', from_number)
        if len(from_number) > 10:
            from_number = from_number[-10:]
        
        # Log incoming message
        whatsapp_msg = WhatsAppMessage(
            from_number=from_number,
            to_number=to_number,
            message=message_body,
            direction="incoming"
        )
        await db.whatsapp_messages.insert_one(whatsapp_msg.dict())
        
        # Get AI response
        ai_response = await process_customer_message(from_number, message_body)
        
        # Check if this needs approval
        needs_approval = ai_response.get("needs_approval", False)
        
        if needs_approval:
            # Create approval item
            await db.approvals.insert_one({
                "id": str(uuid.uuid4()),
                "item_type": "whatsapp_reply",
                "customer_name": ai_response.get("customer_name", "Unknown"),
                "customer_phone": from_number,
                "details": {
                    "original_message": message_body,
                    "suggested_reply": ai_response.get("response", ""),
                    "intent": ai_response.get("intent", "")
                },
                "ai_response": ai_response.get("response", ""),
                "status": "pending",
                "created_at": datetime.utcnow()
            })
            
            return {"status": "pending_approval", "message_id": whatsapp_msg.id}
        else:
            # Auto-send response (for general queries)
            # In production, this would send via Exotel WhatsApp API
            return {
                "status": "auto_replied",
                "response": ai_response.get("response", ""),
                "message_id": whatsapp_msg.id
            }
        
    except Exception as e:
        logging.error(f"WhatsApp webhook error: {str(e)}")
        return {"status": "error", "message": str(e)}

async def process_customer_message(phone: str, message: str) -> dict:
    """Process customer message with AI and determine if approval needed"""
    
    # Get training data for context
    products = await db.products.find({"in_stock": True}).to_list(50)
    store_info = await db.store_info.find({"is_active": True}).to_list(30)
    workflow_rules = await db.workflow_rules.find({"is_active": True}).to_list(20)
    
    # Check for existing customer
    customer = await db.customers.find_one({"phone": {"$regex": phone[-10:]}})
    customer_name = customer.get("name", "Customer") if customer else "Customer"
    
    # Build product catalog for AI
    product_catalog = "\n".join([
        f"- {p.get('name')} ({p.get('brand')}): ₹{p.get('base_price')} (can go down to ₹{p.get('min_price')})"
        for p in products
    ])
    
    # Build store info
    store_info_text = "\n".join([
        f"{i.get('title')}: {i.get('content')}"
        for i in store_info
    ])
    
    # Check workflow rules for approval requirements
    needs_approval = False
    for rule in workflow_rules:
        trigger = rule.get("trigger", "").lower()
        if trigger in message.lower() or any(word in message.lower() for word in trigger.split()):
            if rule.get("requires_approval", True):
                needs_approval = True
                break
    
    # Keywords that always need approval
    approval_keywords = ["price", "quote", "cost", "discount", "offer", "deal", "emi", "complaint", "problem", "issue", "not working"]
    if any(keyword in message.lower() for keyword in approval_keywords):
        needs_approval = True
    
    system_prompt = f"""You are Jarvis, the AI assistant for Walia Brothers Electronics Store.

CUSTOMER: {customer_name} (Phone: {phone})
MESSAGE: {message}

PRODUCT CATALOG:
{product_catalog if products else "No products in database yet"}

STORE INFORMATION:
{store_info_text if store_info else "Delivery available, EMI options available, 1 year warranty on all products"}

YOUR TASK:
1. Understand what the customer wants
2. If asking about PRICE/QUOTE: Mention the product and price range, but say "Let me confirm the best price for you and get back shortly"
3. If reporting COMPLAINT: Collect details and say "I've noted your complaint and our team will contact you shortly"
4. For general questions: Answer helpfully

RESPOND IN JSON FORMAT:
{{
    "response": "Your friendly response in Hindi-English mix",
    "intent": "inquiry" or "complaint" or "general",
    "needs_approval": true/false,
    "product_mentioned": "product name if any",
    "suggested_price": "price if giving quote",
    "customer_name": "{customer_name}"
}}

Keep response conversational and warm. Use "ji" respectfully."""

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"whatsapp-{phone}-{uuid.uuid4()}",
            system_message=system_prompt
        ).with_model("openai", "gpt-4o")
        
        response_text = await chat.send_message(UserMessage(text=message))
        
        # Parse JSON response
        import json
        try:
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            if json_match:
                ai_result = json.loads(json_match.group())
                ai_result["needs_approval"] = needs_approval or ai_result.get("needs_approval", False)
                return ai_result
        except:
            pass
        
        return {
            "response": response_text,
            "intent": "general",
            "needs_approval": needs_approval,
            "customer_name": customer_name
        }
        
    except Exception as e:
        logging.error(f"AI processing error: {str(e)}")
        return {
            "response": "Namaste ji! Thank you for contacting Walia Brothers. Our team will get back to you shortly.",
            "intent": "general",
            "needs_approval": True,
            "customer_name": customer_name
        }

@api_router.get("/exotel/call-logs")
async def get_call_logs(limit: int = 50):
    """Get recent call logs"""
    logs = await db.call_logs.find().sort("created_at", -1).limit(limit).to_list(limit)
    return [ExotelCallLog(**log) for log in logs]

@api_router.get("/exotel/whatsapp-messages")
async def get_whatsapp_messages(limit: int = 50, pending_only: bool = False):
    """Get WhatsApp messages"""
    query = {}
    if pending_only:
        query["requires_approval"] = True
        query["approved"] = False
    
    messages = await db.whatsapp_messages.find(query).sort("created_at", -1).limit(limit).to_list(limit)
    return [WhatsAppMessage(**msg) for msg in messages]

@api_router.post("/exotel/send-whatsapp")
async def send_whatsapp_message(to_number: str, message: str):
    """Send WhatsApp message via Exotel (manual send)"""
    if not EXOTEL_API_KEY:
        raise HTTPException(status_code=500, detail="Exotel not configured")
    
    # Log outgoing message
    whatsapp_msg = WhatsAppMessage(
        from_number="store",
        to_number=to_number,
        message=message,
        direction="outgoing",
        status="sent"
    )
    await db.whatsapp_messages.insert_one(whatsapp_msg.dict())
    
    # In production, this would call Exotel WhatsApp API
    # For now, return success with instructions
    return {
        "success": True,
        "message_id": whatsapp_msg.id,
        "note": "Configure Exotel WhatsApp API endpoint for automatic sending"
    }

@api_router.put("/approvals/{item_id}/send")
async def approve_and_send(item_id: str, custom_message: Optional[str] = None):
    """Approve an item and send the response"""
    item = await db.approvals.find_one({"id": item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Approval item not found")
    
    message_to_send = custom_message or item.get("ai_response", "")
    phone = item.get("customer_phone", "")
    
    # Mark as approved
    await db.approvals.update_one(
        {"id": item_id},
        {"$set": {"status": "approved", "reviewed_at": datetime.utcnow()}}
    )
    
    # Create lead or complaint based on intent
    details = item.get("details", {})
    intent = details.get("intent", "")
    
    if intent == "inquiry":
        # Create lead
        lead = Lead(
            customer_name=item.get("customer_name", ""),
            phone=phone,
            product_interested=details.get("product_mentioned", ""),
            notes=f"From WhatsApp. Message: {details.get('original_message', '')}",
            status="New"
        )
        await db.leads.insert_one(lead.dict())
    elif intent == "complaint":
        # Create complaint
        complaint = Complaint(
            customer_phone=phone,
            customer_name=item.get("customer_name", ""),
            product_type=details.get("product_mentioned", ""),
            brand="",
            issue_description=details.get("original_message", ""),
            status="Pending"
        )
        await db.complaints.insert_one(complaint.dict())
    
    return {
        "success": True,
        "message_sent": message_to_send,
        "to_number": phone
    }

# ============ ROOT & HEALTH ============

@api_router.get("/")
async def root():
    return {"message": "Walia Brothers Jarvis API", "version": "1.0.0"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
