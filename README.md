# Encrypted Message Service

A secure, encrypted message sharing application that enables users to create time-limited text messages with optional "burn after reading" functionality. All encryption happens client-side using modern browser APIs, ensuring that your sensitive data never reaches the server in an unencrypted form.

## Features

- **Client-side encryption**: All messages are encrypted in the browser before being sent to the server.
- **Time-limited messages**: Set expiration periods of 1 day, 1 week, 1 month, or 1 year.
- **Burn after reading**: Messages can be set to self-destruct after being viewed.
- **Secure URL sharing**: The decryption key is never sent to the server, only shared in the URL fragment.
- **Content type detection**: Auto-detects JSON, Markdown, YAML, or prose content.
- **Syntax highlighting**: Using Prism.js for code readability.
- **Responsive design**: Works on desktop and mobile browsers.

## Security Features

- All encryption/decryption happens client-side using the Web Crypto API
- Encryption keys never transmitted to the server
- Keys shared via URL fragments (#) which are not sent in HTTP requests
- Messages automatically expire after the set time period
- Optional burn-after-reading functionality
- Different key sizes based on expiration time for additional security

## Technologies Used

- **Frontend**: React.js, Web Crypto API, Prism.js
- **Backend**: Python FastAPI
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Optional - can be enabled via Supabase Auth

## Installation

### Prerequisites

- Python 3.8+
- Node.js 14+
- Supabase account

### Backend Setup

1. Clone the repository:
   ```
   git clone https://github.com/dorey/txtmsgpaste.git
   cd encrypted-message-service
   ```

2. Create a virtual environment and install dependencies:
   ```
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. Copy the environment example file and update with your Supabase credentials:
   ```
   cp .env.example .env
   # Edit .env with your Supabase details
   ```

4. Run the database migrations in your Supabase project:
   - Copy the contents of `migrations/create_tables.sql`
   - Run them in your Supabase SQL editor

5. Start the backend server:
   ```
   uvicorn main:app --reload
   ```

### Frontend Setup

1. Install frontend dependencies:
   ```
   cd frontend
   npm install
   ```

2. Create a `.env` file with your backend API URL:
   ```
   REACT_APP_API_URL=http://localhost:8000
   ```

3. Build the frontend:
   ```
   npm run build
   ```

4. Copy the build files to the backend static folder:
   ```
   cp -r build/* ../static/
   ```

## Usage

1. Open your browser and navigate to `http://localhost:8000`
2. Enter a message and select expiration time
3. Optionally enable "burn after reading"
4. Click "Create Encrypted Message"
5. Share the generated URL with the recipient

## API Documentation

The API documentation is available at `http://localhost:8000/docs` when the server is running.

### Key Endpoints

- `POST /api/paste` - Create a new encrypted message
- `GET /api/paste/{uid}` - Retrieve an encrypted message
- `POST /api/del/{uid}` - Delete a message (burn after reading)

## Future Enhancements

This application is designed with future expansion in mind:

- Support for encrypted file uploads
- Image encryption and sharing
- HTML page encryption and hosting
- Two-factor authentication for message access
- Password protection for messages
- Message threading and conversations

## License

MIT

## Security Notice

While this application uses strong encryption algorithms, no system is 100% secure. Use at your own risk and do not use for highly sensitive information without additional security measures.
