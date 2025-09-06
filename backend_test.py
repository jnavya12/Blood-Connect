#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for Blood Donation App
Tests all core functionality including authentication, blood requests, donor responses, and user management.
"""

import asyncio
import httpx
import json
import uuid
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
ROOT_DIR = Path(__file__).parent / "backend"
load_dotenv(ROOT_DIR / '.env')

# Configuration
BACKEND_URL = "https://pulse-aid.preview.emergentagent.com/api"
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')

class BloodDonationAPITester:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
        self.mongo_client = AsyncIOMotorClient(MONGO_URL)
        self.db = self.mongo_client[DB_NAME]
        self.test_user_id = str(uuid.uuid4())
        self.test_session_token = str(uuid.uuid4())
        self.test_request_id = None
        self.test_response_id = None
        
    async def setup_test_data(self):
        """Setup test user and session in database"""
        print("🔧 Setting up test data...")
        
        # Create test user
        test_user = {
            "id": self.test_user_id,
            "email": "test@blooddonation.com",
            "name": "Test User",
            "picture": None,
            "user_type": "donor",
            "city": "Mumbai",
            "phone": "+91-9876543210",
            "emergency_contact": "+91-9876543211",
            "created_at": datetime.now(timezone.utc)
        }
        
        # Insert or update test user
        await self.db.users.delete_one({"email": "test@blooddonation.com"})
        await self.db.users.insert_one(test_user)
        
        # Create test session
        test_session = {
            "id": str(uuid.uuid4()),
            "user_id": self.test_user_id,
            "session_token": self.test_session_token,
            "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
            "created_at": datetime.now(timezone.utc)
        }
        
        # Insert test session
        await self.db.sessions.delete_one({"user_id": self.test_user_id})
        await self.db.sessions.insert_one(test_session)
        
        print(f"✅ Test user created with ID: {self.test_user_id}")
        print(f"✅ Test session created with token: {self.test_session_token}")

    async def cleanup_test_data(self):
        """Clean up test data"""
        print("🧹 Cleaning up test data...")
        await self.db.users.delete_one({"id": self.test_user_id})
        await self.db.sessions.delete_one({"user_id": self.test_user_id})
        await self.db.blood_requests.delete_many({"requester_id": self.test_user_id})
        await self.db.donor_responses.delete_many({"donor_id": self.test_user_id})
        print("✅ Test data cleaned up")

    def get_auth_headers(self):
        """Get authentication headers"""
        return {
            "Authorization": f"Bearer {self.test_session_token}",
            "Content-Type": "application/json"
        }

    async def test_health_check(self):
        """Test basic API connectivity"""
        print("\n🏥 Testing API Health Check...")
        try:
            # Test root endpoint (should be added to backend)
            response = await self.client.get(f"{BACKEND_URL}/")
            print(f"Root endpoint status: {response.status_code}")
            
            # Test stats endpoint as health check alternative
            response = await self.client.get(f"{BACKEND_URL}/stats")
            if response.status_code == 200:
                data = response.json()
                print(f"✅ API is accessible - Stats: {data}")
                return True
            else:
                print(f"❌ API health check failed: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ API connectivity failed: {str(e)}")
            return False

    async def test_database_connectivity(self):
        """Test MongoDB connectivity"""
        print("\n🗄️ Testing Database Connectivity...")
        try:
            # Test database connection
            await self.db.command("ping")
            
            # Test collections exist
            collections = await self.db.list_collection_names()
            print(f"✅ Database connected - Collections: {collections}")
            return True
        except Exception as e:
            print(f"❌ Database connectivity failed: {str(e)}")
            return False

    async def test_authentication_system(self):
        """Test authentication endpoints"""
        print("\n🔐 Testing Authentication System...")
        results = []
        
        # Test 1: Get current user info
        try:
            response = await self.client.get(
                f"{BACKEND_URL}/auth/me",
                headers=self.get_auth_headers()
            )
            if response.status_code == 200:
                user_data = response.json()
                print(f"✅ GET /auth/me - User: {user_data['name']} ({user_data['email']})")
                results.append(True)
            else:
                print(f"❌ GET /auth/me failed: {response.status_code} - {response.text}")
                results.append(False)
        except Exception as e:
            print(f"❌ GET /auth/me error: {str(e)}")
            results.append(False)

        # Test 2: Update profile
        try:
            profile_update = {
                "user_type": "requester",
                "city": "Delhi",
                "phone": "+91-9876543299"
            }
            response = await self.client.put(
                f"{BACKEND_URL}/auth/profile",
                headers=self.get_auth_headers(),
                json=profile_update
            )
            if response.status_code == 200:
                updated_user = response.json()
                print(f"✅ PUT /auth/profile - Updated city: {updated_user['city']}")
                results.append(True)
            else:
                print(f"❌ PUT /auth/profile failed: {response.status_code} - {response.text}")
                results.append(False)
        except Exception as e:
            print(f"❌ PUT /auth/profile error: {str(e)}")
            results.append(False)

        # Test 3: Set session cookie
        try:
            session_data = {"session_token": self.test_session_token}
            response = await self.client.post(
                f"{BACKEND_URL}/auth/set-session",
                json=session_data
            )
            if response.status_code == 200:
                print("✅ POST /auth/set-session - Session cookie set")
                results.append(True)
            else:
                print(f"❌ POST /auth/set-session failed: {response.status_code} - {response.text}")
                results.append(False)
        except Exception as e:
            print(f"❌ POST /auth/set-session error: {str(e)}")
            results.append(False)

        return all(results)

    async def test_blood_request_management(self):
        """Test blood request CRUD operations"""
        print("\n🩸 Testing Blood Request Management...")
        results = []

        # Test 1: Create blood request
        try:
            request_data = {
                "patient_name": "John Doe",
                "blood_group": "O+",
                "units_needed": 2,
                "hospital_name": "City Hospital",
                "hospital_address": "123 Main Street, Delhi",
                "city": "Delhi",
                "urgency": "critical",
                "description": "Emergency surgery required, patient lost significant blood"
            }
            response = await self.client.post(
                f"{BACKEND_URL}/requests",
                headers=self.get_auth_headers(),
                json=request_data
            )
            if response.status_code == 200:
                created_request = response.json()
                self.test_request_id = created_request["id"]
                print(f"✅ POST /requests - Created request ID: {self.test_request_id}")
                results.append(True)
            else:
                print(f"❌ POST /requests failed: {response.status_code} - {response.text}")
                results.append(False)
        except Exception as e:
            print(f"❌ POST /requests error: {str(e)}")
            results.append(False)

        # Test 2: Get all requests
        try:
            response = await self.client.get(f"{BACKEND_URL}/requests")
            if response.status_code == 200:
                requests = response.json()
                print(f"✅ GET /requests - Found {len(requests)} requests")
                results.append(True)
            else:
                print(f"❌ GET /requests failed: {response.status_code} - {response.text}")
                results.append(False)
        except Exception as e:
            print(f"❌ GET /requests error: {str(e)}")
            results.append(False)

        # Test 3: Get requests with city filter
        try:
            response = await self.client.get(f"{BACKEND_URL}/requests?city=Delhi")
            if response.status_code == 200:
                filtered_requests = response.json()
                print(f"✅ GET /requests?city=Delhi - Found {len(filtered_requests)} requests")
                results.append(True)
            else:
                print(f"❌ GET /requests with city filter failed: {response.status_code}")
                results.append(False)
        except Exception as e:
            print(f"❌ GET /requests with city filter error: {str(e)}")
            results.append(False)

        # Test 4: Get requests with urgency filter
        try:
            response = await self.client.get(f"{BACKEND_URL}/requests?urgency=critical")
            if response.status_code == 200:
                urgent_requests = response.json()
                print(f"✅ GET /requests?urgency=critical - Found {len(urgent_requests)} requests")
                results.append(True)
            else:
                print(f"❌ GET /requests with urgency filter failed: {response.status_code}")
                results.append(False)
        except Exception as e:
            print(f"❌ GET /requests with urgency filter error: {str(e)}")
            results.append(False)

        # Test 5: Get my requests
        try:
            response = await self.client.get(
                f"{BACKEND_URL}/requests/my",
                headers=self.get_auth_headers()
            )
            if response.status_code == 200:
                my_requests = response.json()
                print(f"✅ GET /requests/my - Found {len(my_requests)} user requests")
                results.append(True)
            else:
                print(f"❌ GET /requests/my failed: {response.status_code} - {response.text}")
                results.append(False)
        except Exception as e:
            print(f"❌ GET /requests/my error: {str(e)}")
            results.append(False)

        # Test 6: Get specific request details
        if self.test_request_id:
            try:
                response = await self.client.get(f"{BACKEND_URL}/requests/{self.test_request_id}")
                if response.status_code == 200:
                    request_details = response.json()
                    print(f"✅ GET /requests/{self.test_request_id} - Patient: {request_details['patient_name']}")
                    results.append(True)
                else:
                    print(f"❌ GET /requests/{self.test_request_id} failed: {response.status_code}")
                    results.append(False)
            except Exception as e:
                print(f"❌ GET /requests/{self.test_request_id} error: {str(e)}")
                results.append(False)

        return all(results)

    async def test_donor_response_system(self):
        """Test donor response functionality"""
        print("\n💝 Testing Donor Response System...")
        results = []

        if not self.test_request_id:
            print("❌ No test request available for response testing")
            return False

        # Test 1: Create donor response
        try:
            response_data = {
                "request_id": self.test_request_id,
                "message": "I am available to donate blood. I am O+ and healthy. Please contact me."
            }
            response = await self.client.post(
                f"{BACKEND_URL}/responses",
                headers=self.get_auth_headers(),
                json=response_data
            )
            if response.status_code == 200:
                created_response = response.json()
                self.test_response_id = created_response["id"]
                print(f"✅ POST /responses - Created response ID: {self.test_response_id}")
                results.append(True)
            else:
                print(f"❌ POST /responses failed: {response.status_code} - {response.text}")
                results.append(False)
        except Exception as e:
            print(f"❌ POST /responses error: {str(e)}")
            results.append(False)

        # Test 2: Try to create duplicate response (should fail)
        try:
            duplicate_response = {
                "request_id": self.test_request_id,
                "message": "Another response from same user"
            }
            response = await self.client.post(
                f"{BACKEND_URL}/responses",
                headers=self.get_auth_headers(),
                json=duplicate_response
            )
            if response.status_code == 400:
                print("✅ POST /responses - Duplicate prevention working")
                results.append(True)
            else:
                print(f"❌ Duplicate response prevention failed: {response.status_code}")
                results.append(False)
        except Exception as e:
            print(f"❌ Duplicate response test error: {str(e)}")
            results.append(False)

        # Test 3: Get my responses
        try:
            response = await self.client.get(
                f"{BACKEND_URL}/responses/my",
                headers=self.get_auth_headers()
            )
            if response.status_code == 200:
                my_responses = response.json()
                print(f"✅ GET /responses/my - Found {len(my_responses)} responses")
                results.append(True)
            else:
                print(f"❌ GET /responses/my failed: {response.status_code} - {response.text}")
                results.append(False)
        except Exception as e:
            print(f"❌ GET /responses/my error: {str(e)}")
            results.append(False)

        return all(results)

    async def test_statistics_api(self):
        """Test statistics dashboard API"""
        print("\n📊 Testing Statistics API...")
        try:
            response = await self.client.get(f"{BACKEND_URL}/stats")
            if response.status_code == 200:
                stats = response.json()
                required_fields = ["total_requests", "active_requests", "total_responses", "total_users"]
                
                if all(field in stats for field in required_fields):
                    print(f"✅ GET /stats - All fields present:")
                    for field in required_fields:
                        print(f"   {field}: {stats[field]}")
                    return True
                else:
                    missing = [f for f in required_fields if f not in stats]
                    print(f"❌ GET /stats - Missing fields: {missing}")
                    return False
            else:
                print(f"❌ GET /stats failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"❌ GET /stats error: {str(e)}")
            return False

    async def test_error_handling(self):
        """Test error handling scenarios"""
        print("\n⚠️ Testing Error Handling...")
        results = []

        # Test 1: Unauthorized access
        try:
            response = await self.client.get(f"{BACKEND_URL}/auth/me")
            if response.status_code == 401:
                print("✅ Unauthorized access properly rejected")
                results.append(True)
            else:
                print(f"❌ Unauthorized access not handled: {response.status_code}")
                results.append(False)
        except Exception as e:
            print(f"❌ Unauthorized test error: {str(e)}")
            results.append(False)

        # Test 2: Invalid request ID
        try:
            response = await self.client.get(f"{BACKEND_URL}/requests/invalid-id")
            if response.status_code == 404:
                print("✅ Invalid request ID properly handled")
                results.append(True)
            else:
                print(f"❌ Invalid request ID not handled: {response.status_code}")
                results.append(False)
        except Exception as e:
            print(f"❌ Invalid request ID test error: {str(e)}")
            results.append(False)

        # Test 3: Invalid request data
        try:
            invalid_data = {
                "patient_name": "",  # Empty required field
                "units_needed": -1,  # Invalid value
            }
            response = await self.client.post(
                f"{BACKEND_URL}/requests",
                headers=self.get_auth_headers(),
                json=invalid_data
            )
            if response.status_code in [400, 422]:
                print("✅ Invalid request data properly validated")
                results.append(True)
            else:
                print(f"❌ Invalid request data not validated: {response.status_code}")
                results.append(False)
        except Exception as e:
            print(f"❌ Invalid data test error: {str(e)}")
            results.append(False)

        return all(results)

    async def run_comprehensive_tests(self):
        """Run all tests and provide summary"""
        print("🚀 Starting Comprehensive Blood Donation API Tests")
        print("=" * 60)
        
        test_results = {}
        
        try:
            # Setup
            await self.setup_test_data()
            
            # Core connectivity tests
            test_results["API Health Check"] = await self.test_health_check()
            test_results["Database Connectivity"] = await self.test_database_connectivity()
            
            # Feature tests
            test_results["Authentication System"] = await self.test_authentication_system()
            test_results["Blood Request Management"] = await self.test_blood_request_management()
            test_results["Donor Response System"] = await self.test_donor_response_system()
            test_results["Statistics API"] = await self.test_statistics_api()
            test_results["Error Handling"] = await self.test_error_handling()
            
        except Exception as e:
            print(f"❌ Critical test error: {str(e)}")
            test_results["Critical Error"] = False
        
        finally:
            # Cleanup
            await self.cleanup_test_data()
            await self.client.aclose()
            self.mongo_client.close()
        
        # Print summary
        print("\n" + "=" * 60)
        print("📋 TEST SUMMARY")
        print("=" * 60)
        
        passed = 0
        total = len(test_results)
        
        for test_name, result in test_results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            print(f"{test_name:<30} {status}")
            if result:
                passed += 1
        
        print("-" * 60)
        print(f"TOTAL: {passed}/{total} tests passed ({(passed/total)*100:.1f}%)")
        
        if passed == total:
            print("🎉 ALL TESTS PASSED - Backend API is working correctly!")
        else:
            print("⚠️ SOME TESTS FAILED - Check individual test results above")
        
        return test_results

async def main():
    """Main test runner"""
    tester = BloodDonationAPITester()
    results = await tester.run_comprehensive_tests()
    return results

if __name__ == "__main__":
    asyncio.run(main())