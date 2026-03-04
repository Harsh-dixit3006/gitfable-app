"""
Test suite for GitFable Draw and Choose endpoints
Tests the new reward mechanics: Draw=10 XP (max 3/day), Choose=5 XP (no cap)
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealthAndIssues:
    """Basic health and issues endpoint tests"""

    def test_issues_endpoint_returns_list(self):
        """GET /api/issues returns a list of issues"""
        response = requests.get(f"{BASE_URL}/api/issues")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Expected issues to be a list"
        assert len(data) > 0, "Expected at least one issue in the list"
        # Verify issue structure
        issue = data[0]
        assert "id" in issue, "Issue should have id"
        assert "repo" in issue, "Issue should have repo"
        assert "title" in issue, "Issue should have title"
        assert "language" in issue, "Issue should have language"
        assert "difficulty" in issue, "Issue should have difficulty"
        print(f"✓ /api/issues returned {len(data)} issues")

    def test_issues_filter_by_language(self):
        """GET /api/issues filters by language"""
        response = requests.get(f"{BASE_URL}/api/issues?language=Python")
        assert response.status_code == 200
        data = response.json()
        for issue in data:
            assert issue["language"] == "Python", f"Expected Python, got {issue['language']}"
        print(f"✓ Language filter works: {len(data)} Python issues")

    def test_issues_filter_by_difficulty(self):
        """GET /api/issues filters by difficulty"""
        response = requests.get(f"{BASE_URL}/api/issues?difficulty=Beginner")
        assert response.status_code == 200
        data = response.json()
        for issue in data:
            assert issue["difficulty"] == "Beginner", f"Expected Beginner, got {issue['difficulty']}"
        print(f"✓ Difficulty filter works: {len(data)} Beginner issues")


class TestAuthentication:
    """Authentication endpoint tests"""

    def test_login_creates_user(self):
        """POST /api/auth/login creates a new user"""
        username = f"TEST_draw_user_{int(time.time())}"
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"username": username})
        assert response.status_code == 200
        data = response.json()
        assert "token" in data, "Login should return token"
        assert "user" in data, "Login should return user"
        assert data["user"]["username"] == username.lower().replace(' ', '-')
        assert data["user"]["xp"] == 0, "New user should start with 0 XP"
        print(f"✓ Login successful for {username}")
        return data

    def test_auth_me_requires_token(self):
        """GET /api/auth/me requires authorization"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("✓ /api/auth/me requires authorization")


class TestDrawEndpoint:
    """Draw endpoint tests - Should award 10 XP and enforce max 3/day"""

    @pytest.fixture
    def auth_user(self):
        """Create a fresh test user and return auth token"""
        username = f"TEST_draw_{int(time.time())}"
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"username": username})
        assert response.status_code == 200
        data = response.json()
        return {"token": data["token"], "user": data["user"]}

    def test_draw_awards_10_xp(self, auth_user):
        """POST /api/draws/draw awards 10 XP"""
        headers = {"Authorization": f"Bearer {auth_user['token']}"}
        response = requests.post(f"{BASE_URL}/api/draws/draw", json={}, headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        # Validate response structure
        assert "id" in data, "Draw should return id"
        assert "repo" in data, "Draw should return repo"
        assert "title" in data, "Draw should return title"
        assert "xp_awarded" in data, "Draw should return xp_awarded"
        assert "redraws_remaining" in data, "Draw should return redraws_remaining"
        
        # Validate XP award
        assert data["xp_awarded"] == 10, f"Draw should award 10 XP, got {data['xp_awarded']}"
        assert data["source"] == "draw", "Source should be 'draw'"
        print(f"✓ Draw awards 10 XP: {data['xp_awarded']}")

    def test_draw_enforces_daily_limit(self):
        """POST /api/draws/draw enforces max 3 draws per day"""
        # Create a unique user specifically for this test
        username = f"TEST_draw_limit_{int(time.time())}"
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"username": username})
        assert response.status_code == 200
        data = response.json()
        headers = {"Authorization": f"Bearer {data['token']}"}
        
        # First 3 draws should succeed
        for i in range(3):
            response = requests.post(f"{BASE_URL}/api/draws/draw", json={}, headers=headers)
            assert response.status_code == 200, f"Draw {i+1} should succeed"
            draw_data = response.json()
            assert draw_data["xp_awarded"] == 10
            print(f"✓ Draw {i+1}/3 successful, remaining: {draw_data.get('redraws_remaining')}")
        
        # 4th draw should fail with 429
        response = requests.post(f"{BASE_URL}/api/draws/draw", json={}, headers=headers)
        assert response.status_code == 429, f"4th draw should return 429, got {response.status_code}"
        error = response.json()
        assert "detail" in error
        assert "max" in error["detail"].lower() or "3" in error["detail"]
        print(f"✓ 4th draw correctly blocked: {error['detail']}")

    def test_draw_with_language_filter(self, auth_user):
        """POST /api/draws/draw respects language filter"""
        headers = {"Authorization": f"Bearer {auth_user['token']}"}
        response = requests.post(
            f"{BASE_URL}/api/draws/draw",
            json={"languages": ["Python"]},
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        # Language should match filter (if issues exist for that language)
        if data.get("language"):
            assert data["language"] == "Python", f"Expected Python, got {data['language']}"
        print("✓ Draw with language filter works")

    def test_draw_with_difficulty_filter(self, auth_user):
        """POST /api/draws/draw respects difficulty filter"""
        headers = {"Authorization": f"Bearer {auth_user['token']}"}
        response = requests.post(
            f"{BASE_URL}/api/draws/draw",
            json={"difficulties": ["Beginner"]},
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        if data.get("difficulty"):
            assert data["difficulty"] == "Beginner", f"Expected Beginner, got {data['difficulty']}"
        print("✓ Draw with difficulty filter works")


class TestChooseEndpoint:
    """Choose endpoint tests - Should award 5 XP with no daily cap"""

    @pytest.fixture
    def auth_user(self):
        """Create a fresh test user and return auth token"""
        username = f"TEST_choose_{int(time.time())}"
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"username": username})
        assert response.status_code == 200
        data = response.json()
        return {"token": data["token"], "user": data["user"]}

    @pytest.fixture
    def sample_issue_id(self):
        """Get a sample issue ID from the issues list"""
        response = requests.get(f"{BASE_URL}/api/issues")
        assert response.status_code == 200
        issues = response.json()
        assert len(issues) > 0
        return issues[0]["id"]

    def test_choose_awards_5_xp(self, auth_user, sample_issue_id):
        """POST /api/draws/choose awards 5 XP"""
        headers = {"Authorization": f"Bearer {auth_user['token']}"}
        response = requests.post(
            f"{BASE_URL}/api/draws/choose",
            json={"issue_id": sample_issue_id},
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Validate response structure
        assert "id" in data, "Choose should return id"
        assert "repo" in data, "Choose should return repo"
        assert "title" in data, "Choose should return title"
        assert "xp_awarded" in data, "Choose should return xp_awarded"
        
        # Validate XP award
        assert data["xp_awarded"] == 5, f"Choose should award 5 XP, got {data['xp_awarded']}"
        assert data["source"] == "choose", "Source should be 'choose'"
        print(f"✓ Choose awards 5 XP: {data['xp_awarded']}")

    def test_choose_no_daily_cap(self, auth_user):
        """POST /api/draws/choose has no daily cap (can choose more than 3)"""
        headers = {"Authorization": f"Bearer {auth_user['token']}"}
        
        # Get multiple issues to choose from
        response = requests.get(f"{BASE_URL}/api/issues")
        issues = response.json()
        assert len(issues) >= 5, "Need at least 5 issues for this test"
        
        # Choose 5 times (more than draw limit of 3)
        for i in range(5):
            issue_id = issues[i]["id"]
            response = requests.post(
                f"{BASE_URL}/api/draws/choose",
                json={"issue_id": issue_id},
                headers=headers
            )
            assert response.status_code == 200, f"Choose {i+1} should succeed, got {response.status_code}"
            data = response.json()
            assert data["xp_awarded"] == 5
            print(f"✓ Choose {i+1}/5 successful (no daily cap)")

    def test_choose_invalid_issue_returns_404(self, auth_user):
        """POST /api/draws/choose returns 404 for invalid issue_id"""
        headers = {"Authorization": f"Bearer {auth_user['token']}"}
        response = requests.post(
            f"{BASE_URL}/api/draws/choose",
            json={"issue_id": "invalid-issue-id-12345"},
            headers=headers
        )
        assert response.status_code == 404, f"Expected 404 for invalid issue, got {response.status_code}"
        print("✓ Choose with invalid issue_id returns 404")

    def test_choose_requires_auth(self, sample_issue_id):
        """POST /api/draws/choose requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/draws/choose",
            json={"issue_id": sample_issue_id}
        )
        assert response.status_code == 401
        print("✓ Choose requires authentication")


class TestBookmarkPRFlow:
    """Bookmark and PR submission flow tests"""

    @pytest.fixture
    def auth_with_draw(self):
        """Create user with a draw"""
        username = f"TEST_bookmark_{int(time.time())}"
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"username": username})
        data = response.json()
        headers = {"Authorization": f"Bearer {data['token']}"}
        
        # Do a draw
        draw_response = requests.post(f"{BASE_URL}/api/draws/draw", json={}, headers=headers)
        draw = draw_response.json()
        return {"token": data["token"], "user": data["user"], "draw": draw, "headers": headers}

    def test_bookmark_draw(self, auth_with_draw):
        """POST /api/draws/{draw_id}/bookmark bookmarks a draw"""
        headers = auth_with_draw["headers"]
        draw_id = auth_with_draw["draw"]["id"]
        
        response = requests.post(f"{BASE_URL}/api/draws/{draw_id}/bookmark", json={}, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "bookmarked"
        print("✓ Bookmark successful")

    def test_submit_pr_after_bookmark(self, auth_with_draw):
        """POST /api/draws/{draw_id}/submit-pr works after bookmark"""
        headers = auth_with_draw["headers"]
        draw_id = auth_with_draw["draw"]["id"]
        
        # First bookmark
        requests.post(f"{BASE_URL}/api/draws/{draw_id}/bookmark", json={}, headers=headers)
        
        # Then submit PR
        pr_response = requests.post(
            f"{BASE_URL}/api/draws/{draw_id}/submit-pr",
            json={"pr_url": "https://github.com/test/repo/pull/123"},
            headers=headers
        )
        assert pr_response.status_code == 200
        print("✓ PR submission after bookmark successful")

    def test_verify_pr(self, auth_with_draw):
        """POST /api/draws/{draw_id}/verify merges PR"""
        headers = auth_with_draw["headers"]
        draw_id = auth_with_draw["draw"]["id"]
        
        # Bookmark -> Submit PR
        requests.post(f"{BASE_URL}/api/draws/{draw_id}/bookmark", json={}, headers=headers)
        requests.post(
            f"{BASE_URL}/api/draws/{draw_id}/submit-pr",
            json={"pr_url": "https://github.com/test/repo/pull/123"},
            headers=headers
        )
        
        # Verify
        verify_response = requests.post(f"{BASE_URL}/api/draws/{draw_id}/verify", json={}, headers=headers)
        assert verify_response.status_code == 200
        data = verify_response.json()
        assert data["xp_earned"] == 100
        print("✓ PR verification successful, +100 XP")

    def test_release_bookmark(self, auth_with_draw):
        """POST /api/draws/{draw_id}/release releases bookmark"""
        headers = auth_with_draw["headers"]
        draw_id = auth_with_draw["draw"]["id"]
        
        # Bookmark
        requests.post(f"{BASE_URL}/api/draws/{draw_id}/bookmark", json={}, headers=headers)
        
        # Release
        release_response = requests.post(f"{BASE_URL}/api/draws/{draw_id}/release", json={}, headers=headers)
        assert release_response.status_code == 200
        print("✓ Bookmark release successful")


class TestHistoryAndDashboard:
    """History and dashboard endpoint tests"""

    @pytest.fixture
    def auth_user(self):
        username = f"TEST_history_{int(time.time())}"
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"username": username})
        data = response.json()
        return {"token": data["token"], "user": data["user"]}

    def test_history_endpoint(self, auth_user):
        """GET /api/draws/history returns user's draw history"""
        headers = {"Authorization": f"Bearer {auth_user['token']}"}
        response = requests.get(f"{BASE_URL}/api/draws/history", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "draws" in data
        assert "stats" in data
        print("✓ History endpoint returns correct structure")

    def test_dashboard_endpoint(self, auth_user):
        """GET /api/dashboard returns dashboard data"""
        headers = {"Authorization": f"Bearer {auth_user['token']}"}
        response = requests.get(f"{BASE_URL}/api/dashboard", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "user" in data
        assert "recent_draws" in data
        assert "heatmap" in data
        assert "badges_meta" in data
        print("✓ Dashboard endpoint returns correct structure")


class TestLeaderboardAndStats:
    """Leaderboard and stats endpoint tests"""

    def test_leaderboard_endpoint(self):
        """GET /api/leaderboard returns ranked users"""
        response = requests.get(f"{BASE_URL}/api/leaderboard")
        assert response.status_code == 200
        data = response.json()
        assert "users" in data
        assert isinstance(data["users"], list)
        print(f"✓ Leaderboard returns {len(data['users'])} users")

    def test_stats_endpoint(self):
        """GET /api/stats returns app statistics"""
        response = requests.get(f"{BASE_URL}/api/stats")
        assert response.status_code == 200
        data = response.json()
        assert "issues_resolved" in data
        assert "active_authors" in data
        assert "repositories_reached" in data
        print("✓ Stats endpoint returns correct structure")

    def test_activity_endpoint(self):
        """GET /api/activity returns recent activity"""
        response = requests.get(f"{BASE_URL}/api/activity")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Activity returns {len(data)} items")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
