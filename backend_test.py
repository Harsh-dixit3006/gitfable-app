#!/usr/bin/env python3
import requests
import sys
from datetime import datetime
import json

class GitFableAPITester:
    def __init__(self, base_url="https://arcane-terminal.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.draw_id = None
        self.tests_run = 0
        self.tests_passed = 0

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json()
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Response: {response.text}")

            return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def auth_headers(self):
        """Get authorization headers"""
        if self.token:
            return {'Authorization': f'Bearer {self.token}'}
        return {}

    # Auth Tests
    def test_login(self, username="test-user-automated"):
        """Test login endpoint"""
        success, response = self.run_test(
            "POST /api/auth/login",
            "POST",
            "auth/login",
            200,
            data={"username": username}
        )
        if success and 'token' in response and 'user' in response:
            self.token = response['token']
            self.user_id = response['user']['id']
            print(f"   Token obtained, User ID: {self.user_id}")
            return True
        return False

    def test_get_me(self):
        """Test get current user endpoint"""
        success, response = self.run_test(
            "GET /api/auth/me",
            "GET",
            "auth/me",
            200,
            headers=self.auth_headers()
        )
        return success and 'id' in response

    # Public Stats Tests
    def test_get_stats(self):
        """Test global stats endpoint"""
        success, response = self.run_test(
            "GET /api/stats",
            "GET",
            "stats",
            200
        )
        return success and 'issues_resolved' in response

    def test_get_activity(self):
        """Test activity feed endpoint"""
        success, response = self.run_test(
            "GET /api/activity",
            "GET",
            "activity",
            200
        )
        return success and isinstance(response, list)

    def test_get_leaderboard(self):
        """Test leaderboard endpoint"""
        success, response = self.run_test(
            "GET /api/leaderboard",
            "GET",
            "leaderboard",
            200
        )
        return success and 'users' in response

    # Issues Tests
    def test_get_issues(self):
        """Test cached issues endpoint"""
        success, response = self.run_test(
            "GET /api/issues",
            "GET",
            "issues",
            200
        )
        return success and isinstance(response, list)

    # Draw System Tests
    def test_draw_issue(self):
        """Test drawing an issue"""
        success, response = self.run_test(
            "POST /api/draws/draw",
            "POST",
            "draws/draw",
            200,
            data={"languages": ["JavaScript"], "difficulties": ["Beginner"]},
            headers=self.auth_headers()
        )
        if success and 'id' in response:
            self.draw_id = response['id']
            print(f"   Draw ID: {self.draw_id}")
            return True
        return False

    def test_bookmark_draw(self):
        """Test bookmarking a drawn issue"""
        if not self.draw_id:
            print("   Skipping - No draw ID available")
            return False
        
        success, response = self.run_test(
            "POST /api/draws/{id}/bookmark",
            "POST",
            f"draws/{self.draw_id}/bookmark",
            200,
            headers=self.auth_headers()
        )
        return success

    def test_submit_pr(self):
        """Test submitting a PR"""
        if not self.draw_id:
            print("   Skipping - No draw ID available")
            return False
            
        success, response = self.run_test(
            "POST /api/draws/{id}/submit-pr",
            "POST",
            f"draws/{self.draw_id}/submit-pr",
            200,
            data={"pr_url": "https://github.com/test/repo/pull/123"},
            headers=self.auth_headers()
        )
        return success

    def test_verify_pr(self):
        """Test verifying a PR merge"""
        if not self.draw_id:
            print("   Skipping - No draw ID available")
            return False
            
        success, response = self.run_test(
            "POST /api/draws/{id}/verify",
            "POST",
            f"draws/{self.draw_id}/verify",
            200,
            headers=self.auth_headers()
        )
        return success

    def test_get_history(self):
        """Test getting draw history"""
        success, response = self.run_test(
            "GET /api/draws/history",
            "GET",
            "draws/history",
            200,
            headers=self.auth_headers()
        )
        return success and 'draws' in response and 'stats' in response

    def test_get_dashboard(self):
        """Test dashboard data endpoint"""
        success, response = self.run_test(
            "GET /api/dashboard", 
            "GET",
            "dashboard",
            200,
            headers=self.auth_headers()
        )
        return success and 'user' in response and 'recent_draws' in response

    def test_get_profile(self, username="test-user-automated"):
        """Test public profile endpoint"""
        success, response = self.run_test(
            f"GET /api/profile/{username}",
            "GET",
            f"profile/{username}",
            200
        )
        return success and 'user' in response

def main():
    print("🚀 Starting GitFable API Tests...")
    print(f"⏰ Test started at: {datetime.now()}")
    
    tester = GitFableAPITester()
    test_username = f"test-user-{datetime.now().strftime('%H%M%S')}"
    
    # Authentication Flow
    print("\n" + "="*50)
    print("🔐 AUTHENTICATION TESTS")
    print("="*50)
    
    if not tester.test_login(test_username):
        print("❌ Login failed - stopping critical tests")
        return 1
    
    if not tester.test_get_me():
        print("❌ Get user info failed")
    
    # Public Endpoints
    print("\n" + "="*50)
    print("🌍 PUBLIC ENDPOINT TESTS")
    print("="*50)
    
    tester.test_get_stats()
    tester.test_get_activity() 
    tester.test_get_leaderboard()
    tester.test_get_issues()
    tester.test_get_profile(test_username)
    
    # Draw System Flow
    print("\n" + "="*50)
    print("🎲 DRAW SYSTEM TESTS")
    print("="*50)
    
    if tester.test_draw_issue():
        tester.test_bookmark_draw()
        tester.test_submit_pr()
        tester.test_verify_pr()
    
    # User Data
    print("\n" + "="*50)
    print("👤 USER DATA TESTS")
    print("="*50)
    
    tester.test_get_history()
    tester.test_get_dashboard()
    
    # Results
    print("\n" + "="*50)
    print("📊 TEST RESULTS")
    print("="*50)
    print(f"Tests passed: {tester.tests_passed}/{tester.tests_run}")
    success_rate = (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0
    print(f"Success rate: {success_rate:.1f}%")
    
    if success_rate >= 80:
        print("🎉 Backend tests mostly successful!")
        return 0
    elif success_rate >= 60:
        print("⚠️  Backend tests partially successful")
        return 0
    else:
        print("❌ Backend tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())