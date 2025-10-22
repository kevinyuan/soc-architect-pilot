// Entry point - Load environment variables first
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

// Now start the server
import './backend/server';
