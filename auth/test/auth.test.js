const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const User = require('../src/models/user.model');
const bcrypt = require('bcrypt');

let mongoServer;

beforeAll(async () => {
    
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    process.env.MONGODB_URI = uri;
    process.env.JWT_SECRET = "test";
    await mongoose.connect(uri);
});

afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
});

afterEach(async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        const collection = collections[key];
        await collection.deleteMany({});
    }
});

describe('Auth API', () => {
    describe('POST /auth/register', () => {
        it('should register a new user successfully', async () => {
            const res = await request(app)
                .post('/auth/register')
                .send({
                    username: 'testuser',
                    email: 'test@example.com',
                    password: 'password123',
                    fullName: {
                        firstName: 'Test',
                        lastName: 'User'
                    }
                });
            
            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('message', 'User registered successfully');
            expect(res.body).toHaveProperty('user');
            expect(res.body.user).toHaveProperty('username', 'testuser');
            expect(res.body.user).not.toHaveProperty('password');

            const userInDb = await User.findOne({ email: 'test@example.com' });
            expect(userInDb).toBeTruthy();
        });

        it('should not register a user with existing email', async () => {
            await User.create({
                username: 'existinguser',
                email: 'test@example.com',
                password: 'password123',
                fullName: { firstName: 'Existing', lastName: 'User' }
            });

            const res = await request(app)
                .post('/auth/register')
                .send({
                    username: 'newuser',
                    email: 'test@example.com',
                    password: 'password123',
                    fullName: {
                        firstName: 'New',
                        lastName: 'User'
                    }
                });

            expect(res.statusCode).toEqual(409);
            expect(res.body).toHaveProperty('message', 'User already exists');
        });
        
        it('should return 400 if required fields are missing', async () => {
            const res = await request(app)
                .post('/auth/register')
                .send({
                    username: 'testuser'
                });
            
            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message', 'Missing required fields');
        });
    });
});

// login tests
describe('POST /auth/login', () => {
    beforeEach(async () => {
        const hashedPassword = await bcrypt.hash('password123', 10);
        await User.create({
            username: 'testuser',
            email: 'test@example.com',
            password: hashedPassword,
            fullName: { firstName: 'Test', lastName: 'User' }
        });
    });

    it('should login a user successfully', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({
                username: 'testuser',
                password: 'password123'
            });
        
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('message', 'User logged in successfully');
        expect(res.body).toHaveProperty('user');
        expect(res.body.user).toHaveProperty('username', 'testuser');
        expect(res.body.user).not.toHaveProperty('password');
    });

    it('should not login a user with wrong password', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({
                username: 'testuser',
                password: 'wrongpassword'
            });
        
        expect(res.statusCode).toEqual(401);
        expect(res.body).toHaveProperty('message', 'Invalid Password');
    });

    it('should not login a user with non-existent username', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({
                username: 'nonexistentuser',
                password: 'password123'
            });
        
        expect(res.statusCode).toEqual(404);
        expect(res.body).toHaveProperty('message', 'User not found');
    });

    it('should return 400 if required fields are missing', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({
                username: 'testuser'
            });
        
        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty('message', 'Missing required fields');
    });
});
