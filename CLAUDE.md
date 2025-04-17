# Encrypted Message Service

This is a secure, client-side encrypted message sharing service built with React and FastAPI.

## Purpose

This application allows users to:
- Create encrypted text messages (up to 1MB)
- Share them via a secure URL with format `https://msg.paste.ms/txt/{uid}#{key}`
- Set expiration times (1 day to 1 year)
- Enable "burn after reading" functionality

## Security Features

- All encryption/decryption happens client-side using the Web Crypto API
- The server never sees plaintext content
- Encryption keys are never transmitted to the server (only in URL fragments)
- Variable-length UIDs and keys based on expiration time
- Messages automatically expire after the set time period

## Key Components

### Frontend (React)
- Main application logic in `App.js`
- Client-side encryption/decryption
- Message creation and viewing interfaces
- Content type auto-detection

### Backend (FastAPI with Supabase)
- REST API for storing and retrieving encrypted messages
- Database operations for message management
- Message expiration handling

## Directory Structure

```
encrypted-message-service/
│
├── frontend/                 # React frontend application
│   ├── public/               # Public assets
│   │   ├── index.html        # HTML template
│   │   └── manifest.json     # Web app manifest
│   ├── src/                  # React source code
│   │   ├── App.js            # Main React component
│   │   ├── App.css           # Component styles
│   │   ├── index.js          # React entry point
│   │   └── index.css         # Base styles
│   └── package.json          # NPM package config
│
├── main.py                   # FastAPI application
├── requirements.txt          # Python dependencies
├── .env                      # Environment variables
├── Dockerfile                # Docker configuration
└── docker-compose.yml        # Docker Compose config
```

## Core Functionality

1. Users input a message and optionally a title
2. They select an expiration period
3. They can enable "burn after reading"
4. The application encrypts the message client-side
5. A shareable URL is generated with the format `https://msg.paste.ms/txt/{uid}#{key}`
6. When accessing the URL, the app fetches the encrypted message from the server
7. The message is decrypted client-side using the key in the URL fragment
8. For "burn after reading" messages, a 15-second countdown starts before deletion

## Technical Details

- Client-side encryption uses AES-GCM with the Web Crypto API
- Content types are auto-detected (JSON, Markdown, YAML, prose)
- Syntax highlighting is handled by Prism.js
- Different key lengths are used based on expiration time (longer for longer expirations)
- The backend uses Supabase (PostgreSQL) for persistence
