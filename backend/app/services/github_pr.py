import httpx
import re
from typing import Dict, Any, Optional

from app.config import GITHUB_CLIENT_ID


class GitHubAPIError(Exception):
    """GitHub API error."""

    pass


def parse_pr_url(pr_url: str) -> tuple[str, str, int]:
    """Parse GitHub PR URL into (owner, repo, pr_number).

    Example: https://github.com/facebook/react/pull/12345
    Returns: ("facebook", "react", 12345)
    """
    # URL format: https://github.com/{owner}/{repo}/pull/{number}
    pattern = r"https://github\.com/([^/]+)/([^/]+)/pull/(\d+)"
    match = re.match(pattern, pr_url)

    if not match:
        raise GitHubAPIError(f"Invalid GitHub PR URL format: {pr_url}")

    owner, repo, pr_number = match.groups()
    return owner, repo, int(pr_number)


async def get_pr_status(
    owner: str, repo: str, pr_number: int, access_token: Optional[str] = None
) -> Dict[str, Any]:
    """Fetch PR status from GitHub API.

    Returns dict with:
    - state: "open", "closed", or "merged"
    - merged: bool
    - merged_at: timestamp or None
    - merge_commit_sha: str or None
    - user_login: PR author
    """
    headers = {
        "Accept": "application/vnd.github.v3+json",
    }

    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    elif GITHUB_CLIENT_ID:
        # Use client ID as fallback for public endpoints
        # Note: This doesn't work for all endpoints
        pass

    url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}"

    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=headers, timeout=30.0)

    if response.status_code == 404:
        raise GitHubAPIError(f"PR not found: {owner}/{repo}#{pr_number}")
    elif response.status_code == 403:
        raise GitHubAPIError(
            "GitHub API rate limit exceeded or authentication required"
        )
    elif response.status_code != 200:
        raise GitHubAPIError(f"GitHub API error: HTTP {response.status_code}")

    data = response.json()

    return {
        "state": data.get("state"),  # "open" or "closed"
        "merged": data.get("merged", False),
        "merged_at": data.get("merged_at"),
        "merge_commit_sha": data.get("merge_commit_sha"),
        "user_login": data.get("user", {}).get("login"),
        "title": data.get("title"),
        "html_url": data.get("html_url"),
    }


async def verify_pr_merge(
    pr_url: str, expected_user: Optional[str] = None, access_token: Optional[str] = None
) -> Dict[str, Any]:
    """Verify that a PR is merged and optionally check the author.

    Args:
        pr_url: GitHub PR URL
        expected_user: Expected PR author (optional)
        access_token: GitHub access token (optional)

    Returns:
        Dict with verification results

    Raises:
        GitHubAPIError: If verification fails
    """
    # Parse PR URL
    try:
        owner, repo, pr_number = parse_pr_url(pr_url)
    except GitHubAPIError:
        raise

    # Fetch PR status
    pr_info = await get_pr_status(owner, repo, pr_number, access_token)

    # Check if merged
    if not pr_info["merged"]:
        # PR is not merged yet
        if pr_info["state"] == "open":
            return {
                "verified": False,
                "status": "open",
                "message": "PR is still open and not merged",
                "pr_info": pr_info,
            }
        else:
            return {
                "verified": False,
                "status": "closed",
                "message": "PR was closed without merging",
                "pr_info": pr_info,
            }

    # PR is merged - check author if specified
    if expected_user and pr_info["user_login"]:
        if pr_info["user_login"].lower() != expected_user.lower():
            return {
                "verified": False,
                "status": "merged",
                "message": f"PR was merged but by different user: {pr_info['user_login']}",
                "pr_info": pr_info,
            }

    # Success!
    return {
        "verified": True,
        "status": "merged",
        "message": "PR verified as merged",
        "pr_info": pr_info,
    }
