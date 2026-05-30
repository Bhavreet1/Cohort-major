const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const mockRedisStore = {};

jest.mock('ioredis', () => {
    return {
        Redis: jest.fn().mockImplementation(() => {
            return {
                on: jest.fn(),
                set: jest.fn().mockImplementation((key, value) => {
                    mockRedisStore[key] = value;
                    return Promise.resolve('OK');
                }),
                get: jest.fn().mockImplementation((key) => {
                    return Promise.resolve(mockRedisStore[key] || null);
                }),
                quit: jest.fn().mockResolvedValue('OK'),
                disconnect: jest.fn().mockResolvedValue('OK')
            };
        })
    };
});


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

describe('GET /auth/me', () => {
    let testUser;
    let cookie;

    beforeEach(async () => {
        const hashedPassword = await bcrypt.hash('password123', 10);
        testUser = await User.create({
            username: 'testuser',
            email: 'test@example.com',
            password: hashedPassword,
            fullName: { firstName: 'Test', lastName: 'User' }
        });

        // Log in to get the authentication cookie
        const res = await request(app)
            .post('/auth/login')
            .send({
                username: 'testuser',
                password: 'password123'
            });

        cookie = res.headers['set-cookie'];
    });

    it('should return the current user details successfully when authenticated', async () => {
        const res = await request(app)
            .get('/auth/me')
            .set('Cookie', cookie);

        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('user');
        expect(res.body.user).toHaveProperty('username', 'testuser');
        expect(res.body.user).toHaveProperty('email', 'test@example.com');
        expect(res.body.user).not.toHaveProperty('password');
    });

    it('should return 401 Unauthorized when no cookie/token is provided', async () => {
        const res = await request(app)
            .get('/auth/me');

        expect(res.statusCode).toEqual(401);
        expect(res.body).toHaveProperty('message');
    });

    it('should return 401 Unauthorized when an invalid cookie/token is provided', async () => {
        const res = await request(app)
            .get('/auth/me')
            .set('Cookie', ['accessToken=invalidtoken123']);

        expect(res.statusCode).toEqual(401);
        expect(res.body).toHaveProperty('message');
    });

    it('should return 404 User Not Found if the user from the token does not exist in the database', async () => {
        // Delete the user from the database
        await User.deleteOne({ _id: testUser._id });

        const res = await request(app)
            .get('/auth/me')
            .set('Cookie', cookie);

        expect(res.statusCode).toEqual(404);
        expect(res.body).toHaveProperty('message');
    });
});

describe('POST /auth/logout', () => {
    let testUser;
    let cookie;

    beforeEach(async () => {
        const hashedPassword = await bcrypt.hash('password123', 10);
        testUser = await User.create({
            username: 'testuser',
            email: 'test@example.com',
            password: hashedPassword,
            fullName: { firstName: 'Test', lastName: 'User' }
        });

        // Log in to get the authentication cookie
        const res = await request(app)
            .post('/auth/login')
            .send({
                username: 'testuser',
                password: 'password123'
            });

        cookie = res.headers['set-cookie'];
    });

    it('should logout a user successfully when authenticated', async () => {
        const res = await request(app)
            .post('/auth/logout')
            .set('Cookie', cookie);

        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('message', 'User logged out successfully');

        // Ensure the cookie is cleared
        expect(res.headers['set-cookie']).toBeDefined();
        const setCookieString = res.headers['set-cookie'].join(' ');
        expect(setCookieString).toContain('accessToken=;');
    });

    it('should return 401 Unauthorized when no cookie/token is provided', async () => {
        const res = await request(app)
            .post('/auth/logout');

        expect(res.statusCode).toEqual(401);
        expect(res.body).toHaveProperty('message', 'Unauthorized');
    });

    it('should return 401 Unauthorized when an invalid cookie/token is provided', async () => {
        const res = await request(app)
            .post('/auth/logout')
            .set('Cookie', ['accessToken=invalidtoken123']);

        expect(res.statusCode).toEqual(401);
        expect(res.body).toHaveProperty('message', 'Unauthorized');
    });

    it('should blacklist the token on logout and reject subsequent requests with that token', async () => {
        // 1. Verify we can access /auth/me successfully first
        const meResBefore = await request(app)
            .get('/auth/me')
            .set('Cookie', cookie);
        expect(meResBefore.statusCode).toEqual(200);

        // 2. Perform logout to blacklist the token
        const logoutRes = await request(app)
            .post('/auth/logout')
            .set('Cookie', cookie);
        expect(logoutRes.statusCode).toEqual(200);

        // 3. Try to access /auth/me again with the same cookie; it should now return 401 Unauthorized
        const meResAfter = await request(app)
            .get('/auth/me')
            .set('Cookie', cookie);
        expect(meResAfter.statusCode).toEqual(401);
        expect(meResAfter.body).toHaveProperty('message', 'Unauthorized');
    });
});

describe('Address Endpoints', () => {
    let testUser;
    let cookie;

    beforeEach(async () => {
        const hashedPassword = await bcrypt.hash('password123', 10);
        testUser = await User.create({
            username: 'testuser',
            email: 'test@example.com',
            password: hashedPassword,
            fullName: { firstName: 'Test', lastName: 'User' },
            addresses: [
                {
                    street: '123 Main St',
                    city: 'Springfield',
                    state: 'IL',
                    zipCode: '627010',
                    country: 'USA'
                }
            ]
        });

        // Log in to get the authentication cookie
        const res = await request(app)
            .post('/auth/login')
            .send({
                username: 'testuser',
                password: 'password123'
            });

        cookie = res.headers['set-cookie'];
    });

    describe('GET /auth/users/me/address', () => {
        it('should retrieve address array for an authenticated user', async () => {
            const res = await request(app)
                .get('/auth/users/me/address')
                .set('Cookie', cookie);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('message', 'User address found successfully');
            expect(res.body).toHaveProperty('address');
            expect(Array.isArray(res.body.address)).toBe(true);
            expect(res.body.address.length).toEqual(1);
            expect(res.body.address[0]).toHaveProperty('street', '123 Main St');
        });

        it('should return 401 Unauthorized when no cookie/token is provided', async () => {
            const res = await request(app)
                .get('/auth/users/me/address');

            expect(res.statusCode).toEqual(401);
            expect(res.body).toHaveProperty('message', 'Unauthorized');
        });

        it('should return 401 Unauthorized when an invalid cookie/token is provided', async () => {
            const res = await request(app)
                .get('/auth/users/me/address')
                .set('Cookie', ['accessToken=invalidtoken123']);

            expect(res.statusCode).toEqual(401);
            expect(res.body).toHaveProperty('message', 'Unauthorized');
        });
    });

    describe('POST /auth/users/me/address', () => {
        it('should add a valid address successfully', async () => {
            const newAddress = {
                street: '456 Oak Rd',
                city: 'Metropolis',
                state: 'NY',
                zipCode: '100012',
                country: 'USA'
            };

            const res = await request(app)
                .post('/auth/users/me/address')
                .set('Cookie', cookie)
                .send(newAddress);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('message', 'Address added successfully');
            expect(res.body).toHaveProperty('address');
            expect(res.body.address).toHaveProperty('street', '456 Oak Rd');
            expect(res.body).toHaveProperty('addresses');
            expect(res.body.addresses.length).toEqual(2);

            // Verify in Database
            const userInDb = await User.findById(testUser._id);
            expect(userInDb.addresses.length).toEqual(2);
            expect(userInDb.addresses[1]).toHaveProperty('street', '456 Oak Rd');
        });

        it('should return 401 Unauthorized when unauthenticated', async () => {
            const newAddress = {
                street: '456 Oak Rd',
                city: 'Metropolis',
                state: 'NY',
                zipCode: '10001',
                country: 'USA'
            };

            const res = await request(app)
                .post('/auth/users/me/address')
                .send(newAddress);

            expect(res.statusCode).toEqual(401);
            expect(res.body).toHaveProperty('message', 'Unauthorized');
        });

        it('should return 400 Bad Request if required fields are missing', async () => {
            const incompleteAddress = {
                street: '456 Oak Rd',
                city: 'Metropolis'
                // missing state, zipCode, country
            };

            const res = await request(app)
                .post('/auth/users/me/address')
                .set('Cookie', cookie)
                .send(incompleteAddress);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message', 'Missing required fields');
            expect(res.body).toHaveProperty('errors');
            expect(res.body.errors.length).toBeGreaterThan(0);
        });

        it('should return 400 Bad Request if fields are of invalid data type (empty strings)', async () => {
            const invalidAddress = {
                street: '',
                city: 'Metropolis',
                state: 'NY',
                zipCode: '10001',
                country: 'USA'
            };

            const res = await request(app)
                .post('/auth/users/me/address')
                .set('Cookie', cookie)
                .send(invalidAddress);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message', 'Missing required fields');
        });
    });

    describe('DELETE /auth/users/me/address/:addressId', () => {
        it('should delete an existing address successfully by ID', async () => {
            const addressId = testUser.addresses[0]._id.toString();

            const res = await request(app)
                .delete(`/auth/users/me/address/${addressId}`)
                .set('Cookie', cookie);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('message', 'Address deleted successfully');
            expect(res.body).toHaveProperty('addresses');
            expect(res.body.addresses.length).toEqual(0);

            // Verify in Database
            const userInDb = await User.findById(testUser._id);
            expect(userInDb.addresses.length).toEqual(0);
        });

        it('should return 401 Unauthorized when unauthenticated', async () => {
            const addressId = testUser.addresses[0]._id.toString();

            const res = await request(app)
                .delete(`/auth/users/me/address/${addressId}`);

            expect(res.statusCode).toEqual(401);
            expect(res.body).toHaveProperty('message', 'Unauthorized');
        });

        it('should return 404 Not Found if the address ID does not exist', async () => {
            const nonExistentId = new mongoose.Types.ObjectId().toString();

            const res = await request(app)
                .delete(`/auth/users/me/address/${nonExistentId}`)
                .set('Cookie', cookie);

            expect(res.statusCode).toEqual(404);
            expect(res.body).toHaveProperty('message', 'Address not found');
        });

        it('should return 400 Bad Request if the address ID format is invalid', async () => {
            const invalidId = 'invalid-mongo-id';

            const res = await request(app)
                .delete(`/auth/users/me/address/${invalidId}`)
                .set('Cookie', cookie);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message', 'Invalid Address ID format');
        });

        it('should not allow deleting another user\'s address', async () => {
            // Create another user with an address
            const otherUser = await User.create({
                username: 'otheruser',
                email: 'other@example.com',
                password: 'password123',
                fullName: { firstName: 'Other', lastName: 'User' },
                addresses: [
                    {
                        street: '789 Pine Ave',
                        city: 'Gotham',
                        state: 'NJ',
                        zipCode: '07001',
                        country: 'USA'
                    }
                ]
            });
            const otherAddressId = otherUser.addresses[0]._id.toString();

            // Attempt to delete other user's address using testUser's session
            const res = await request(app)
                .delete(`/auth/users/me/address/${otherAddressId}`)
                .set('Cookie', cookie);

            expect(res.statusCode).toEqual(404);
            expect(res.body).toHaveProperty('message', 'Address not found');

            // Verify in Database that the other user's address still exists
            const otherUserInDb = await User.findById(otherUser._id);
            expect(otherUserInDb.addresses.length).toEqual(1);
        });
    });
});


