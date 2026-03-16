#!/usr/bin/env python3
"""
Extended Backend API Testing for Walia Brothers Jarvis Store Assistant
Tests Excel import/export, AI analytics, and edge cases
"""

import requests
import json
import io
import pandas as pd
from typing import Dict, Any

# Configuration
BASE_URL = "https://smart-store-ai-2.preview.emergentagent.com/api"
HEADERS = {"Content-Type": "application/json"}

class ExtendedAPITester:
    def __init__(self):
        self.base_url = BASE_URL
        self.headers = HEADERS
        self.test_results = []
    
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
    
    def make_request(self, method: str, endpoint: str, data: Dict = None, params: Dict = None, files: Dict = None) -> tuple:
        """Make HTTP request and return (success, response_data, status_code)"""
        url = f"{self.base_url}{endpoint}"
        try:
            headers = self.headers.copy() if not files else {}
            
            if method.upper() == "GET":
                response = requests.get(url, headers=headers, params=params, timeout=30)
            elif method.upper() == "POST":
                if files:
                    response = requests.post(url, files=files, params=params, timeout=30)
                else:
                    response = requests.post(url, headers=headers, json=data, params=params, timeout=30)
            else:
                return False, {"error": "Invalid method"}, 400
            
            # Handle different response types
            if 'application/json' in response.headers.get('content-type', ''):
                try:
                    response_data = response.json()
                except:
                    response_data = {"raw_response": response.text}
            elif 'application/vnd.openxmlformats' in response.headers.get('content-type', ''):
                response_data = {"file_size": len(response.content), "content_type": response.headers.get('content-type')}
            else:
                response_data = {"raw_response": response.text[:500]}
            
            return response.status_code < 400, response_data, response.status_code
        except Exception as e:
            return False, {"error": str(e)}, 0

    def test_excel_import_export(self):
        """Test Excel import/export functionality"""
        print("\n=== Testing Excel Import/Export ===")
        
        # First create some test data
        customer_data = {
            "name": "Excel Test Customer",
            "phone": "9876543299",
            "brand": "Samsung",
            "purchased_product": "Refrigerator",
            "address": "Test Address"
        }
        
        success, data, status = self.make_request("POST", "/customers", customer_data)
        if success:
            customer_id = data.get("id")
            print(f"Created test customer: {customer_id}")
        
        # Test customer export
        success, data, status = self.make_request("GET", "/export/customers")
        if success and data.get("file_size", 0) > 0:
            self.log_result("Excel - Export Customers", True, f"Exported Excel file ({data['file_size']} bytes)")
        else:
            self.log_result("Excel - Export Customers", False, f"Failed to export customers", f"Status: {status}, Data: {data}")
        
        # Test leads export
        success, data, status = self.make_request("GET", "/export/leads")
        if success and data.get("file_size", 0) > 0:
            self.log_result("Excel - Export Leads", True, f"Exported leads Excel file ({data['file_size']} bytes)")
        else:
            self.log_result("Excel - Export Leads", False, f"Failed to export leads", f"Status: {status}, Data: {data}")
        
        # Test Excel import (create a sample Excel file)
        try:
            # Create sample Excel data
            sample_data = {
                'Name': ['Import Test 1', 'Import Test 2'],
                'Phone': ['9876543301', '9876543302'],
                'Address': ['Address 1 with phone 9876543301', 'Address 2'],
                'Product': ['TV', 'AC'],
                'Brand': ['LG', 'Samsung']
            }
            df = pd.DataFrame(sample_data)
            
            # Save to BytesIO
            excel_buffer = io.BytesIO()
            df.to_excel(excel_buffer, index=False)
            excel_buffer.seek(0)
            
            # Test import
            files = {'file': ('test_customers.xlsx', excel_buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
            success, data, status = self.make_request("POST", "/import/customers", files=files)
            
            if success and data.get("imported_count", 0) > 0:
                self.log_result("Excel - Import Customers", True, f"Imported {data['imported_count']} customers")
            else:
                self.log_result("Excel - Import Customers", False, f"Failed to import customers", f"Status: {status}, Data: {data}")
                
        except Exception as e:
            self.log_result("Excel - Import Customers", False, f"Exception during import test: {str(e)}")
        
        # Clean up test customer
        if customer_id:
            self.make_request("DELETE", f"/customers/{customer_id}")

    def test_ai_analytics(self):
        """Test AI Analytics functionality"""
        print("\n=== Testing AI Analytics ===")
        
        # Test AI analyze endpoint
        success, data, status = self.make_request("POST", "/ai/analyze", params={"query": "What are the top selling brands?"})
        if success and data.get("response"):
            self.log_result("AI - Analyze Query", True, f"AI responded: {data['response'][:100]}...")
        else:
            self.log_result("AI - Analyze Query", False, f"AI analysis failed", f"Status: {status}, Data: {data}")
        
        # Test another AI query
        success, data, status = self.make_request("POST", "/ai/analyze", params={"query": "How many pending complaints do we have?"})
        if success and data.get("response"):
            self.log_result("AI - Complaints Query", True, f"AI responded about complaints")
        else:
            self.log_result("AI - Complaints Query", False, f"AI complaints query failed", f"Status: {status}, Data: {data}")

    def test_advanced_features(self):
        """Test advanced features and edge cases"""
        print("\n=== Testing Advanced Features ===")
        
        # Test dashboard follow-ups
        success, data, status = self.make_request("GET", "/dashboard/follow-ups")
        if success and "leads" in data and "complaints" in data:
            self.log_result("Dashboard - Follow-ups", True, f"Got follow-ups: {len(data['leads'])} leads, {len(data['complaints'])} complaints")
        else:
            self.log_result("Dashboard - Follow-ups", False, f"Failed to get follow-ups", f"Status: {status}, Data: {data}")
        
        # Test health check
        success, data, status = self.make_request("GET", "/health")
        if success and data.get("status") == "healthy":
            self.log_result("Health Check", True, "API is healthy")
        else:
            self.log_result("Health Check", False, f"Health check failed", f"Status: {status}, Data: {data}")
        
        # Test root endpoint
        success, data, status = self.make_request("GET", "/")
        if success and "Walia Brothers" in str(data):
            self.log_result("Root Endpoint", True, "Root endpoint working")
        else:
            self.log_result("Root Endpoint", False, f"Root endpoint failed", f"Status: {status}, Data: {data}")

    def test_customer_group_operations(self):
        """Test customer group operations"""
        print("\n=== Testing Customer Group Operations ===")
        
        # Create a customer first
        customer_data = {
            "name": "Group Test Customer",
            "phone": "9876543288",
            "brand": "LG"
        }
        
        success, data, status = self.make_request("POST", "/customers", customer_data)
        if success:
            customer_id = data.get("id")
            
            # Add customer to group
            success, data, status = self.make_request("POST", f"/customers/{customer_id}/groups/VIP Customers")
            if success:
                self.log_result("Customer Groups - Add to Group", True, "Customer added to group")
            else:
                self.log_result("Customer Groups - Add to Group", False, f"Failed to add customer to group", f"Status: {status}")
            
            # Remove customer from group
            success, data, status = self.make_request("DELETE", f"/customers/{customer_id}/groups/VIP Customers")
            if success:
                self.log_result("Customer Groups - Remove from Group", True, "Customer removed from group")
            else:
                self.log_result("Customer Groups - Remove from Group", False, f"Failed to remove customer from group", f"Status: {status}")
            
            # Clean up
            self.make_request("DELETE", f"/customers/{customer_id}")

    def test_search_and_filters(self):
        """Test search and filtering capabilities"""
        print("\n=== Testing Search and Filters ===")
        
        # Test customer search by brand
        success, data, status = self.make_request("GET", "/customers", params={"brand": "Samsung"})
        if success and isinstance(data, list):
            self.log_result("Search - Customer by Brand", True, f"Found {len(data)} Samsung customers")
        else:
            self.log_result("Search - Customer by Brand", False, f"Brand search failed", f"Status: {status}")
        
        # Test complaint search by brand
        success, data, status = self.make_request("GET", "/complaints", params={"brand": "LG"})
        if success and isinstance(data, list):
            self.log_result("Search - Complaint by Brand", True, f"Found {len(data)} LG complaints")
        else:
            self.log_result("Search - Complaint by Brand", False, f"Complaint brand search failed", f"Status: {status}")
        
        # Test lead search
        success, data, status = self.make_request("GET", "/leads", params={"search": "TV"})
        if success and isinstance(data, list):
            self.log_result("Search - Lead by Product", True, f"Found {len(data)} TV leads")
        else:
            self.log_result("Search - Lead by Product", False, f"Lead search failed", f"Status: {status}")

    def run_extended_tests(self):
        """Run all extended tests"""
        print(f"🚀 Starting extended backend API testing for: {self.base_url}")
        print("=" * 80)
        
        try:
            self.test_excel_import_export()
            self.test_ai_analytics()
            self.test_advanced_features()
            self.test_customer_group_operations()
            self.test_search_and_filters()
            
        except Exception as e:
            print(f"❌ Extended test execution failed: {str(e)}")
            self.log_result("Extended Test Execution", False, f"Exception occurred: {str(e)}")
        
        # Print summary
        self.print_summary()

    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 80)
        print("📊 EXTENDED TEST SUMMARY")
        print("=" * 80)
        
        passed = sum(1 for r in self.test_results if "✅ PASS" in r['status'])
        failed = sum(1 for r in self.test_results if "❌ FAIL" in r['status'])
        total = len(self.test_results)
        
        print(f"Total Extended Tests: {total}")
        print(f"Passed: {passed} ✅")
        print(f"Failed: {failed} ❌")
        print(f"Success Rate: {(passed/total*100):.1f}%" if total > 0 else "0%")
        
        if failed > 0:
            print("\n❌ FAILED EXTENDED TESTS:")
            for result in self.test_results:
                if "❌ FAIL" in result['status']:
                    print(f"  - {result['test']}: {result['message']}")
                    if result['details']:
                        print(f"    {result['details']}")
        
        print("\n" + "=" * 80)

if __name__ == "__main__":
    tester = ExtendedAPITester()
    tester.run_extended_tests()