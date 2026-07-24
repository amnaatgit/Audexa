const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

// Initialize database tables if they don't exist
async function initializeDatabase() {
    const client = await pool.connect();
    try {
          await client.query(`
                                   CREATE TABLE IF NOT EXISTS invoices (
                                             id VARCHAR(50) PRIMARY KEY,
                                             ts TIMESTAMP NOT NULL,
                                             vendorId VARCHAR(100) NOT NULL,
                                             vendorName VARCHAR(255) NOT NULL,
                                             category VARCHAR(100),
                                             invoiceRef VARCHAR(100),
                                             amount NUMERIC(15,2),
                                             billFrom VARCHAR(100),
                                             shipFrom VARCHAR(100),
                                             hour INTEGER,
                                             lineItems TEXT,
                                             score NUMERIC(5,2),
                                             tier1Score NUMERIC(5,2),
                                             tier1Ms INTEGER,
                                             decision VARCHAR(50),
                                             factors TEXT,
                                             audit TEXT,
                                             reviewStatus VARCHAR(50),
                                             createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                                           )
                                 `);

                                 await client.query(`
                                                          CREATE TABLE IF NOT EXISTS weights (
                                                                    ruleId VARCHAR(100) PRIMARY KEY,
                                                                    baseWeight NUMERIC(10,4),
                                                                    currentWeight NUMERIC(10,4),
                                                                    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                                                                  )
                                                        `);

                                                        await client.query(`
                                                                                 CREATE TABLE IF NOT EXISTS meta (
                                                                                           k VARCHAR(100) PRIMARY KEY,
                                                                                           v TEXT,
                                                                                           updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                                                                                         )
                                                                               `);

                                                                               await client.query(`
                                                                                                        CREATE TABLE IF NOT EXISTS users (
                                                                                                                  username VARCHAR(100) PRIMARY KEY,
                                                                                                                  passwordHash VARCHAR(255) NOT NULL,
                                                                                                                  role VARCHAR(50) NOT NULL,
                                                                                                                  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                                                                                                                )
                                                                                                      `);

                                                                                                      await client.query(`
                                                                                                                               CREATE TABLE IF NOT EXISTS audit_log (
                                                                                                                                         id SERIAL PRIMARY KEY,
                                                                                                                                         username VARCHAR(100),
                                                                                                                                         action VARCHAR(255),
                                                                                                                                         details TEXT,
                                                                                                                                         hash VARCHAR(64),
                                                                                                                                         prevHash VARCHAR(64),
                                                                                                                                         ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                                                                                                                                       )
                                                                                                                             `);
                                                                                                                         
                                                                                                                             console.log('Database tables initialized');
                                                                                                                         } finally {
                                                                                                                               client.release();
                                                                                                                         }
                                                                                                                         }
                                                                                                                         
                                                                                                                         // Wrapper for prepared statements using parameterized queries
                                                                                                                         const db = {
                                                                                                                             prepare: (sql) => ({
                                                                                                                                   run: async (...params) => {
                                                                                                                                           const client = await pool.connect();
                                                                                                                                           try {
                                                                                                                                                     const result = await client.query(sql, params);
                                                                                                                                                     return { changes: result.rowCount, lastID: result.rows[0]?.id };
                                                                                                                                           } finally {
                                                                                                                                                     client.release();
                                                                                                                                           }
                                                                                                                                   },
                                                                                                                                         get: async (...params) => {
                                                                                                                                                 const client = await pool.connect();
                                                                                                                                                 try {
                                                                                                                                                           const result = await client.query(sql, params);
                                                                                                                                                           return result.rows[0] || null;
                                                                                                                                                 } finally {
                                                                                                                                                           client.release();
                                                                                                                                                 }
                                                                                                                                         },
                                                                                                                                               all: async (...params) => {
                                                                                                                                                       const client = await pool.connect();
                                                                                                                                                       try {
                                                                                                                                                                 const result = await client.query(sql, params);
                                                                                                                                                                 return result.rows;
                                                                                                                                                       } finally {
                                                                                                                                                                 client.release();
                                                                                                                                                       }
                                                                                                                                               },
                                                                                                                             }),
                                                                                                                             exec: async (sql) => {
                                                                                                                                   const client = await pool.connect();
                                                                                                                                   try {
                                                                                                                                           await client.query(sql);
                                                                                                                                   } finally {
                                                                                                                                           client.release();
                                                                                                                                   }
                                                                                                                             },
                                                                                                                                 transaction: async (callback) => {
                                                                                                                                       const client = await pool.connect();
                                                                                                                                       try {
                                                                                                                                               await client.query('BEGIN');
                                                                                                                                               const result = await callback(client);
                                                                                                                                               await client.query('COMMIT');
                                                                                                                                               return result;
                                                                                                                                       } catch (error) {
                                                                                                                                               await client.query('ROLLBACK');
                                                                                                                                               throw error;
                                                                                                                                       } finally {
                                                                                                                                               client.release();
                                                                                                                                       }
                                                                                                                                 },
                                                                                                                         };
                                                                                                                         
                                                                                                                         module.exports = { db, pool, initializeDatabase };
