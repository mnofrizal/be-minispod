import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

/**
 * Hash password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
const hashPassword = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

/**
 * Compare password with hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} Password match result
 */
const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

/**
 * Generate JWT access token
 * @param {Object} payload - Token payload
 * @returns {string} JWT token
 */
const generateAccessToken = (payload) => {
  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { 
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      issuer: 'paas-backend',
      audience: 'paas-frontend'
    }
  );
};

/**
 * Generate JWT refresh token
 * @param {Object} payload - Token payload
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (payload) => {
  return jwt.sign(
    payload,
    process.env.JWT_REFRESH_SECRET,
    { 
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      issuer: 'paas-backend',
      audience: 'paas-frontend'
    }
  );
};

/**
 * Verify JWT access token
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 */
const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET, {
    issuer: 'paas-backend',
    audience: 'paas-frontend'
  });
};

/**
 * Verify JWT refresh token
 * @param {string} token - JWT refresh token
 * @returns {Object} Decoded token payload
 */
const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
    issuer: 'paas-backend',
    audience: 'paas-frontend'
  });
};

/**
 * Generate random string for secrets
 * @param {number} length - Length of random string
 * @returns {string} Random string
 */
const generateRandomString = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Generate HMAC signature for webhooks
 * @param {string} payload - Payload to sign
 * @param {string} secret - Secret key
 * @returns {string} HMAC signature
 */
const generateHmacSignature = (payload, secret) => {
  return crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
};

/**
 * Verify HMAC signature
 * @param {string} payload - Original payload
 * @param {string} signature - Signature to verify
 * @param {string} secret - Secret key
 * @returns {boolean} Signature validity
 */
const verifyHmacSignature = (payload, signature, secret) => {
  const expectedSignature = generateHmacSignature(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
};

/**
 * Generate secure customer subdomain
 * @param {string} userId - User ID
 * @param {string} serviceName - Service name
 * @returns {string} Subdomain
 */
const generateSubdomain = (userId, serviceName) => {
  // Create a short hash from user ID for uniqueness
  const hash = crypto
    .createHash('md5')
    .update(userId)
    .digest('hex')
    .substring(0, 8);
  
  return `${serviceName}-${hash}`;
};

/**
 * Generate random credentials for services
 * @returns {Object} Generated credentials
 */
const generateServiceCredentials = () => {
  const username = `user_${generateRandomString(8)}`;
  const password = generateRandomString(16);
  const apiKey = generateRandomString(32);
  
  return {
    username,
    password,
    apiKey,
    createdAt: new Date().toISOString()
  };
};

export {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateRandomString,
  generateHmacSignature,
  verifyHmacSignature,
  generateSubdomain,
  generateServiceCredentials
};