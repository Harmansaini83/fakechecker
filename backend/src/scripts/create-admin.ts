import 'dotenv/config';
import { pool } from '../db/pool.js';
import { hashPassword } from '../services/password.js';

const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 10) { console.error('usage: create-admin <email> <password(10+)>'); process.exit(1); }
await pool.query(`INSERT INTO admin_users (email, password_hash, role) VALUES ($1,$2,'admin')`, [email.toLowerCase(), await hashPassword(password)]);
console.log('admin created');
await pool.end();