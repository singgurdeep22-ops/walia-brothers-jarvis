from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import re
import io
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
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
