#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for Walia Brothers Jarvis Store Assistant
Tests all CRUD operations, authentication, and integrations
"""

import requests
import json
import time
import sys
from typing import Dict, Any, List
import urllib.parse

# Configuration
BASE_URL = "https://retail-crm-assistant.preview.emergentagent.com/api"
HEADERS = {"Content-Type": "application/json"}

class APITester:
    def __init__(self):
        self.base_url = BASE_URL
        self.headers = HEADERS
        self.test_results = []
        self.created_ids = {
            'customers': [],
            'leads': [],
            'complaints': [],
            'campaigns': [],
            'groups': [],
            'staff': []
        }
    
    def log_result(self, test_name: str, success: bool, message: str, details: str = ""):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        result = {
            'test': test_name,
            'status': status,
            'message': message,
            'details': details
        }
        self.test_results.append(result)
        print(f"{status} {test_name}: {message}")
        if details and not success:
            print(f"   Details: {details}")
    
    def make_request(self, method: str, endpoint: str, data: Dict = None, params: Dict = None) -> tuple:
        """Make HTTP request and return (success, response_data, status_code)"""
        url = f"{self.base_url}{endpoint}"
        try:
            if method.upper() == "GET":
                response = requests.get(url, headers=self.headers, params=params, timeout=30)
            elif method.upper() == "POST":
                response = requests.post(url, headers=self.headers, json=data, params=params, timeout=30)
            elif method.upper() == "PUT":
                response = requests.put(url, headers=self.headers, json=data, params=params, timeout=30)
            elif method.upper() == "DELETE":
                response = requests.delete(url, headers=self.headers, params=params, timeout=30)
            else:
                return False, {"error": "Invalid method"}, 400
            
            try:
                response_data = response.json()
            except:
                response_data = {"raw_response": response.text}
            
            return response.status_code < 400, response_data, response.status_code
        except Exception as e:
            return False, {"error": str(e)}, 0

    def test_authentication(self):
        """Test PIN authentication endpoints"""
        print("\n=== Testing Authentication ===")
        
        # Test valid PIN
        success, data, status = self.make_request("POST", "/auth/verify-pin", params={"pin": "1234"})
        if success and data.get("success"):
            self.log_result("Auth - Valid PIN", True, "PIN 1234 verified successfully")
        else:
            self.log_result("Auth - Valid PIN", False, f"Failed to verify PIN 1234", f"Status: {status}, Data: {data}")
        
        # Test invalid PIN
        success, data, status = self.make_request("POST", "/auth/verify-pin", params={"pin": "wrong"})
        if not success and status == 401:
            self.log_result("Auth - Invalid PIN", True, "Correctly rejected invalid PIN")
        else:
            self.log_result("Auth - Invalid PIN", False, f"Should reject invalid PIN", f"Status: {status}, Data: {data}")
        
        # Test PIN change
        success, data, status = self.make_request("POST", "/auth/change-pin", params={"old_pin": "1234", "new_pin": "5678"})
        if success and data.get("success"):
            self.log_result("Auth - Change PIN", True, "PIN changed successfully")
            # Change back to original
            self.make_request("POST", "/auth/change-pin", params={"old_pin": "5678", "new_pin": "1234"})
        else:
            self.log_result("Auth - Change PIN", False, f"Failed to change PIN", f"Status: {status}, Data: {data}")

    def test_customers_crud(self):
        """Test Customer CRUD operations"""
        print("\n=== Testing Customer CRUD ===")
        
        # Create customer
        customer_data = {
            "name": "Rajesh Kumar",
            "phone": "9876543211",
            "brand": "Samsung",
            "purchased_product": "AC",
            "address": "123 Main Street, Delhi",
            "purchase_date": "2024-01-15"
        }
        
        success, data, status = self.make_request("POST", "/customers", customer_data)
        if success and data.get("id"):
            customer_id = data["id"]
            self.created_ids['customers'].append(customer_id)
            self.log_result("Customer - Create", True, f"Customer created with ID: {customer_id}")
        else:
            self.log_result("Customer - Create", False, f"Failed to create customer", f"Status: {status}, Data: {data}")
            return
        
        # Get all customers
        success, data, status = self.make_request("GET", "/customers")
        if success and isinstance(data, list):
            self.log_result("Customer - List All", True, f"Retrieved {len(data)} customers")
        else:
            self.log_result("Customer - List All", False, f"Failed to get customers", f"Status: {status}, Data: {data}")
        
        # Search customers
        success, data, status = self.make_request("GET", "/customers", params={"search": "Rajesh"})
        if success and isinstance(data, list) and len(data) > 0:
            self.log_result("Customer - Search", True, f"Search found {len(data)} customers")
        else:
            self.log_result("Customer - Search", False, f"Search failed or no results", f"Status: {status}, Data: {data}")
        
        # Update customer
        update_data = {**customer_data, "notes": "Updated customer notes"}
        success, data, status = self.make_request("PUT", f"/customers/{customer_id}", update_data)
        if success and data.get("notes") == "Updated customer notes":
            self.log_result("Customer - Update", True, "Customer updated successfully")
        else:
            self.log_result("Customer - Update", False, f"Failed to update customer", f"Status: {status}, Data: {data}")
        
        # Get specific customer
        success, data, status = self.make_request("GET", f"/customers/{customer_id}")
        if success and data.get("id") == customer_id:
            self.log_result("Customer - Get by ID", True, "Retrieved customer by ID")
        else:
            self.log_result("Customer - Get by ID", False, f"Failed to get customer by ID", f"Status: {status}, Data: {data}")

    def test_leads_crud(self):
        """Test Lead CRUD operations"""
        print("\n=== Testing Lead CRUD ===")
        
        # Create lead
        lead_data = {
            "customer_name": "Priya Sharma",
            "phone": "9876543212",
            "product_interested": "TV",
            "city": "Delhi",
            "budget_range": "50000-70000",
            "status": "New"
        }
        
        success, data, status = self.make_request("POST", "/leads", lead_data)
        if success and data.get("id"):
            lead_id = data["id"]
            self.created_ids['leads'].append(lead_id)
            self.log_result("Lead - Create", True, f"Lead created with ID: {lead_id}")
        else:
            self.log_result("Lead - Create", False, f"Failed to create lead", f"Status: {status}, Data: {data}")
            return
        
        # Get all leads
        success, data, status = self.make_request("GET", "/leads")
        if success and isinstance(data, list):
            self.log_result("Lead - List All", True, f"Retrieved {len(data)} leads")
        else:
            self.log_result("Lead - List All", False, f"Failed to get leads", f"Status: {status}, Data: {data}")
        
        # Filter by status
        success, data, status = self.make_request("GET", "/leads", params={"status": "New"})
        if success and isinstance(data, list):
            self.log_result("Lead - Filter by Status", True, f"Found {len(data)} new leads")
        else:
            self.log_result("Lead - Filter by Status", False, f"Failed to filter leads", f"Status: {status}, Data: {data}")
        
        # Update lead
        update_data = {**lead_data, "status": "Contacted", "notes": "Called customer"}
        success, data, status = self.make_request("PUT", f"/leads/{lead_id}", update_data)
        if success and data.get("status") == "Contacted":
            self.log_result("Lead - Update", True, "Lead updated successfully")
        else:
            self.log_result("Lead - Update", False, f"Failed to update lead", f"Status: {status}, Data: {data}")

    def test_complaints_crud(self):
        """Test Complaint CRUD operations"""
        print("\n=== Testing Complaint CRUD ===")
        
        # Create complaint
        complaint_data = {
            "customer_phone": "9876543213",
            "customer_name": "Amit Singh",
            "product_type": "AC",
            "brand": "LG",
            "issue_description": "AC not cooling properly",
            "purchase_date": "2023-12-01",
            "product_size": "1.5 Ton"
        }
        
        success, data, status = self.make_request("POST", "/complaints", complaint_data)
        if success and data.get("id"):
            complaint_id = data["id"]
            self.created_ids['complaints'].append(complaint_id)
            self.log_result("Complaint - Create", True, f"Complaint created with ID: {complaint_id}")
        else:
            self.log_result("Complaint - Create", False, f"Failed to create complaint", f"Status: {status}, Data: {data}")
            return
        
        # Get all complaints
        success, data, status = self.make_request("GET", "/complaints")
        if success and isinstance(data, list):
            self.log_result("Complaint - List All", True, f"Retrieved {len(data)} complaints")
        else:
            self.log_result("Complaint - List All", False, f"Failed to get complaints", f"Status: {status}, Data: {data}")
        
        # Get WhatsApp link
        success, data, status = self.make_request("GET", f"/complaints/{complaint_id}/whatsapp-link")
        if success and data.get("whatsapp_link") and "wa.me" in data["whatsapp_link"]:
            self.log_result("Complaint - WhatsApp Link", True, f"Generated WhatsApp link: {data['whatsapp_link'][:50]}...")
        else:
            self.log_result("Complaint - WhatsApp Link", False, f"Failed to generate WhatsApp link", f"Status: {status}, Data: {data}")
        
        # Update complaint status
        success, data, status = self.make_request("PUT", f"/complaints/{complaint_id}", params={"status": "In Progress"})
        if success and data.get("status") == "In Progress":
            self.log_result("Complaint - Update Status", True, "Complaint status updated")
        else:
            self.log_result("Complaint - Update Status", False, f"Failed to update complaint status", f"Status: {status}, Data: {data}")

    def test_groups_and_campaigns(self):
        """Test Groups and Campaigns"""
        print("\n=== Testing Groups and Campaigns ===")
        
        # Create group
        group_data = {
            "name": "TV Buyers",
            "description": "Customers who bought TVs"
        }
        
        success, data, status = self.make_request("POST", "/groups", group_data)
        if success and data.get("id"):
            group_id = data["id"]
            self.created_ids['groups'].append(group_id)
            self.log_result("Group - Create", True, f"Group created with ID: {group_id}")
        else:
            self.log_result("Group - Create", False, f"Failed to create group", f"Status: {status}, Data: {data}")
        
        # Get all groups
        success, data, status = self.make_request("GET", "/groups")
        if success and isinstance(data, list):
            self.log_result("Group - List All", True, f"Retrieved {len(data)} groups")
        else:
            self.log_result("Group - List All", False, f"Failed to get groups", f"Status: {status}, Data: {data}")
        
        # Create campaign
        campaign_data = {
            "name": "Diwali Sale",
            "message": "Big discounts on all electronics! Visit Walia Brothers now!",
            "target_groups": ["TV Buyers"]
        }
        
        success, data, status = self.make_request("POST", "/campaigns", campaign_data)
        if success and data.get("id"):
            campaign_id = data["id"]
            self.created_ids['campaigns'].append(campaign_id)
            self.log_result("Campaign - Create", True, f"Campaign created with ID: {campaign_id}")
        else:
            self.log_result("Campaign - Create", False, f"Failed to create campaign", f"Status: {status}, Data: {data}")
            return
        
        # Get all campaigns
        success, data, status = self.make_request("GET", "/campaigns")
        if success and isinstance(data, list):
            self.log_result("Campaign - List All", True, f"Retrieved {len(data)} campaigns")
        else:
            self.log_result("Campaign - List All", False, f"Failed to get campaigns", f"Status: {status}, Data: {data}")
        
        # Get campaign contacts
        success, data, status = self.make_request("GET", f"/campaigns/{campaign_id}/contacts")
        if success and "contacts" in data:
            self.log_result("Campaign - Get Contacts", True, f"Retrieved {data.get('count', 0)} contacts")
        else:
            self.log_result("Campaign - Get Contacts", False, f"Failed to get campaign contacts", f"Status: {status}, Data: {data}")

    def test_staff_management(self):
        """Test Staff Management"""
        print("\n=== Testing Staff Management ===")
        
        # Create staff
        staff_data = {
            "name": "Ravi Kumar",
            "phone": "9876543214",
            "role": "Technician"
        }
        
        success, data, status = self.make_request("POST", "/staff", staff_data)
        if success and data.get("id"):
            staff_id = data["id"]
            self.created_ids['staff'].append(staff_id)
            self.log_result("Staff - Create", True, f"Staff created with ID: {staff_id}")
        else:
            self.log_result("Staff - Create", False, f"Failed to create staff", f"Status: {status}, Data: {data}")
        
        # Get all staff
        success, data, status = self.make_request("GET", "/staff")
        if success and isinstance(data, list):
            self.log_result("Staff - List All", True, f"Retrieved {len(data)} staff members")
        else:
            self.log_result("Staff - List All", False, f"Failed to get staff", f"Status: {status}, Data: {data}")

    def test_dashboard_and_settings(self):
        """Test Dashboard and Settings"""
        print("\n=== Testing Dashboard and Settings ===")
        
        # Get dashboard stats
        success, data, status = self.make_request("GET", "/dashboard/stats")
        if success and "total_customers" in data:
            self.log_result("Dashboard - Stats", True, f"Stats: {data['total_customers']} customers, {data['total_leads']} leads")
        else:
            self.log_result("Dashboard - Stats", False, f"Failed to get dashboard stats", f"Status: {status}, Data: {data}")
        
        # Get settings
        success, data, status = self.make_request("GET", "/settings")
        if success and "store_name" in data:
            self.log_result("Settings - Get", True, f"Store: {data['store_name']}")
        else:
            self.log_result("Settings - Get", False, f"Failed to get settings", f"Status: {status}, Data: {data}")
        
        # Update settings
        success, data, status = self.make_request("PUT", "/settings", params={"store_name": "Walia Brothers Electronics"})
        if success and data.get("success"):
            self.log_result("Settings - Update", True, "Settings updated successfully")
        else:
            self.log_result("Settings - Update", False, f"Failed to update settings", f"Status: {status}, Data: {data}")

    def test_ai_suggestions(self):
        """Test AI Suggestions"""
        print("\n=== Testing AI Suggestions ===")
        
        # Get AI suggestions
        success, data, status = self.make_request("GET", "/ai/suggestions")
        if success and "suggestions" in data:
            self.log_result("AI - Suggestions", True, f"Got {len(data['suggestions'])} suggestions")
        else:
            self.log_result("AI - Suggestions", False, f"Failed to get AI suggestions", f"Status: {status}, Data: {data}")

    def cleanup_test_data(self):
        """Clean up created test data"""
        print("\n=== Cleaning up test data ===")
        
        # Delete in reverse order to handle dependencies
        for entity_type in ['campaigns', 'groups', 'staff', 'complaints', 'leads', 'customers']:
            for entity_id in self.created_ids[entity_type]:
                endpoint = f"/{entity_type}/{entity_id}"
                success, data, status = self.make_request("DELETE", endpoint)
                if success:
                    print(f"✅ Deleted {entity_type[:-1]} {entity_id}")
                else:
                    print(f"❌ Failed to delete {entity_type[:-1]} {entity_id}")

    def run_all_tests(self):
        """Run all tests"""
        print(f"🚀 Starting comprehensive backend API testing for: {self.base_url}")
        print("=" * 80)
        
        try:
            self.test_authentication()
            self.test_customers_crud()
            self.test_leads_crud()
            self.test_complaints_crud()
            self.test_groups_and_campaigns()
            self.test_staff_management()
            self.test_dashboard_and_settings()
            self.test_ai_suggestions()
            
            # Clean up test data
            self.cleanup_test_data()
            
        except Exception as e:
            print(f"❌ Test execution failed: {str(e)}")
            self.log_result("Test Execution", False, f"Exception occurred: {str(e)}")
        
        # Print summary
        self.print_summary()

    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 80)
        print("📊 TEST SUMMARY")
        print("=" * 80)
        
        passed = sum(1 for r in self.test_results if "✅ PASS" in r['status'])
        failed = sum(1 for r in self.test_results if "❌ FAIL" in r['status'])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed} ✅")
        print(f"Failed: {failed} ❌")
        print(f"Success Rate: {(passed/total*100):.1f}%" if total > 0 else "0%")
        
        if failed > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if "❌ FAIL" in result['status']:
                    print(f"  - {result['test']}: {result['message']}")
                    if result['details']:
                        print(f"    {result['details']}")
        
        print("\n" + "=" * 80)

if __name__ == "__main__":
    tester = APITester()
    tester.run_all_tests()