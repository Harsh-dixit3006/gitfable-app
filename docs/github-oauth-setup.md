# GitHub OAuth Configuration

## Creating a GitHub OAuth App

1. Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App

2. Fill in the details:
   - **Application name**: GitFable
   - **Homepage URL**: http://localhost:3000 (development) or your production URL
   - **Authorization callback URL**: http://localhost:8001/api/auth/github/callback (development)

3. Copy the Client ID and generate a Client Secret

4. Add to your backend/.env:
   ```
   GITHUB_CLIENT_ID=your_client_id_here
   GITHUB_CLIENT_SECRET=your_client_secret_here
   GITHUB_REDIRECT_URI=http://localhost:8001/api/auth/github/callback
   ```

## Scopes

The app requests these GitHub scopes:
- `read:user` - Read user profile information
- `user:email` - Read user email addresses

These are the minimum scopes needed for authentication.

## Security Considerations

- Never commit the Client Secret to version control
- Use different OAuth Apps for development and production
- The redirect URI must match exactly what's registered in GitHub
- State parameter prevents CSRF attacks
