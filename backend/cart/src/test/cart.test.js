const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = require('../app');
const Cart = require('../models/cart.model');

// Mock Product Service HTTP interactions (support both axios and fetch patterns)
const mockProductServiceResponse = {
    productId: '64b0f9c2d1b4c92b2c9a1a2b',
    title: 'Wireless Headphones',
    price: { amount: 2999, currency: 'INR' },
    stock: { quantity: 10 }
};

// Mock Axios globally if used in controller
jest.mock('axios', () => {
    return {
        get: jest.fn(),
        post: jest.fn()
    };
}, { virtual: true });

// Mock native fetch/undici if used in controller
if (!global.fetch) {
    global.fetch = jest.fn();
} else {
    jest.spyOn(global, 'fetch');
}

const axios = require('axios');

let mongoServer;

beforeAll(async () => {
    // Setup in-memory MongoDB database
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    process.env.MONGODB_URI = uri;
    
    // Connect mongoose to in-memory database
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(uri);
    }
});

afterAll(async () => {
    // Close mongoose connection and stop in-memory MongoDB
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
});

afterEach(async () => {
    jest.clearAllMocks();
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        const collection = collections[key];
        await collection.deleteMany({});
    }
});

describe('Cart Service API Tests', () => {
    const validUserId = new mongoose.Types.ObjectId().toString();
    const validProductId = new mongoose.Types.ObjectId().toString();

    // Helper: Seed initial cart directly in DB
    const seedCart = async (userId, items = []) => {
        let totalAmount = 0;
        let totalItems = 0;
        const processedItems = items.map(item => {
            const subtotal = item.price.amount * item.qty;
            totalAmount += subtotal;
            totalItems += item.qty;
            return { ...item, subtotal };
        });

        return await Cart.create({
            userId,
            items: processedItems,
            totalAmount,
            totalItems
        });
    };

    // Helper to mock successful product service responses
    const mockProductServiceSuccess = (productId, price = 2999, stock = 10, title = 'Wireless Headphones') => {
        const responseData = {
            message: 'Product fetched successfully',
            product: {
                _id: productId,
                title,
                price: { amount: price, currency: 'INR' },
                stock: { quantity: stock },
                seller: new mongoose.Types.ObjectId().toString(),
                varaints: ['Black']
            }
        };

        // Mock Axios response
        if (axios.get) {
            axios.get.mockResolvedValue({ data: responseData });
        }
        // Mock Native Fetch response
        if (global.fetch.mockImplementation) {
            global.fetch.mockImplementation(() =>
                Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve(responseData)
                })
            );
        }
    };

    // Helper to mock product service failure (not found or error)
    const mockProductServiceFailure = (status = 404, message = 'Product not found') => {
        if (axios.get) {
            axios.get.mockRejectedValue({
                response: { status, data: { message } }
            });
        }
        if (global.fetch.mockImplementation) {
            global.fetch.mockImplementation(() =>
                Promise.resolve({
                    ok: false,
                    status,
                    json: () => Promise.resolve({ message })
                })
            );
        }
    };

    describe('GET /cart - Fetch current cart', () => {
        it('should return 200 with empty cart structure if user has no cart in DB', async () => {
            const res = await request(app)
                .get('/cart')
                .set('x-test-user-id', validUserId);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('items');
            expect(res.body.items).toEqual([]);
            expect(res.body.totalAmount).toEqual(0);
            expect(res.body.totalItems).toEqual(0);
        });

        it('should return 200 and recompute prices from Product Service to avoid tampering', async () => {
            // Seed cart in DB with old/tampered price (e.g., amount = 1000)
            await seedCart(validUserId, [
                {
                    productId: validProductId,
                    title: 'Wireless Headphones',
                    price: { amount: 1000, currency: 'INR' },
                    qty: 2
                }
            ]);

            // Mock Product Service returning latest price (amount = 1500)
            mockProductServiceSuccess(validProductId, 1500, 10);

            const res = await request(app)
                .get('/cart')
                .set('x-test-user-id', validUserId);

            expect(res.statusCode).toEqual(200);
            expect(res.body.items.length).toEqual(1);
            // Must use the price from Product Service (1500), not the seeded/tampered DB price (1000)
            expect(res.body.items[0].price.amount).toEqual(1500);
            expect(res.body.items[0].subtotal).toEqual(3000); // 1500 * 2
            expect(res.body.totalAmount).toEqual(3000);
            expect(res.body.totalItems).toEqual(2);

            // Verify updated prices are optionally saved/cached back to the Cart DB
            const updatedCartInDb = await Cart.findOne({ userId: validUserId });
            expect(updatedCartInDb.items[0].price.amount).toEqual(1500);
            expect(updatedCartInDb.totalAmount).toEqual(3000);
        });

        it('should return 401 Unauthorized if no user context is provided', async () => {
            const res = await request(app).get('/cart');
            expect(res.statusCode).toEqual(401);
        });
    });

    describe('POST /cart/items - Add item to cart', () => {
        it('should successfully add a new item to cart and reserve stock optionally', async () => {
            mockProductServiceSuccess(validProductId, 2999, 5);

            const res = await request(app)
                .post('/cart/items')
                .send({
                    userId: validUserId,
                    productId: validProductId,
                    qty: 2
                });

            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('items');
            expect(res.body.items.length).toEqual(1);
            expect(res.body.items[0].productId.toString()).toEqual(validProductId);
            expect(res.body.items[0].qty).toEqual(2);
            expect(res.body.items[0].price.amount).toEqual(2999);
            expect(res.body.totalAmount).toEqual(5998); // 2999 * 2
            expect(res.body.totalItems).toEqual(2);

            // Verify it saved to DB
            const cart = await Cart.findOne({ userId: validUserId });
            expect(cart).toBeDefined();
            expect(cart.items.length).toEqual(1);
        });

        it('should increment the quantity if the product is already in the cart', async () => {
            // Seed cart with 1 item
            await seedCart(validUserId, [
                {
                    productId: validProductId,
                    title: 'Wireless Headphones',
                    price: { amount: 2999, currency: 'INR' },
                    qty: 1
                }
            ]);

            mockProductServiceSuccess(validProductId, 2999, 10);

            const res = await request(app)
                .post('/cart/items')
                .send({
                    userId: validUserId,
                    productId: validProductId,
                    qty: 2
                });

            expect(res.statusCode).toEqual(200); // 200 for update, or 201
            expect(res.body.items[0].qty).toEqual(3); // 1 + 2
            expect(res.body.totalAmount).toEqual(8997); // 2999 * 3
            expect(res.body.totalItems).toEqual(3);
        });

        it('should return 400 Bad Request if productId or qty is missing', async () => {
            const res = await request(app)
                .post('/cart/items')
                .send({
                    userId: validUserId,
                    qty: 2
                });

            expect(res.statusCode).toEqual(400);
        });

        it('should return 400 Bad Request if quantity is less than or equal to 0', async () => {
            const res = await request(app)
                .post('/cart/items')
                .send({
                    userId: validUserId,
                    productId: validProductId,
                    qty: 0
                });

            expect(res.statusCode).toEqual(400);
        });

        it('should return 400 Bad Request if requested qty exceeds available stock in Product Service', async () => {
            mockProductServiceSuccess(validProductId, 2999, 3); // stock only 3

            const res = await request(app)
                .post('/cart/items')
                .send({
                    userId: validUserId,
                    productId: validProductId,
                    qty: 5 // requesting 5
                });

            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toMatch(/stock|availability/i);
        });

        it('should return 404 Not Found if product does not exist in Product Service', async () => {
            mockProductServiceFailure(404, 'Product not found');

            const res = await request(app)
                .post('/cart/items')
                .send({
                    userId: validUserId,
                    productId: validProductId,
                    qty: 1
                });

            expect(res.statusCode).toEqual(404);
        });
    });

    describe('PATCH /cart/items/:productId - Change quantity', () => {
        it('should update the quantity of an existing item and recalculate totals', async () => {
            await seedCart(validUserId, [
                {
                    productId: validProductId,
                    title: 'Wireless Headphones',
                    price: { amount: 2000, currency: 'INR' },
                    qty: 1
                }
            ]);

            mockProductServiceSuccess(validProductId, 2000, 10);

            const res = await request(app)
                .patch(`/cart/items/${validProductId}`)
                .send({
                    userId: validUserId,
                    qty: 4
                });

            expect(res.statusCode).toEqual(200);
            expect(res.body.items[0].qty).toEqual(4);
            expect(res.body.totalAmount).toEqual(8000); // 2000 * 4
            expect(res.body.totalItems).toEqual(4);
        });

        it('should remove the item from cart if updated qty <= 0', async () => {
            await seedCart(validUserId, [
                {
                    productId: validProductId,
                    title: 'Wireless Headphones',
                    price: { amount: 2000, currency: 'INR' },
                    qty: 3
                }
            ]);

            // No Product Service check strictly needed if removing, but stub for safety
            mockProductServiceSuccess(validProductId, 2000, 10);

            const res = await request(app)
                .patch(`/cart/items/${validProductId}`)
                .send({
                    userId: validUserId,
                    qty: 0
                });

            expect(res.statusCode).toEqual(200);
            expect(res.body.items.length).toEqual(0);
            expect(res.body.totalAmount).toEqual(0);
            expect(res.body.totalItems).toEqual(0);

            // Verify in DB
            const cart = await Cart.findOne({ userId: validUserId });
            expect(cart.items.length).toEqual(0);
        });

        it('should return 400 Bad Request if new quantity exceeds product stock availability', async () => {
            await seedCart(validUserId, [
                {
                    productId: validProductId,
                    title: 'Wireless Headphones',
                    price: { amount: 2000, currency: 'INR' },
                    qty: 1
                }
            ]);

            mockProductServiceSuccess(validProductId, 2000, 2); // Stock is only 2

            const res = await request(app)
                .patch(`/cart/items/${validProductId}`)
                .send({
                    userId: validUserId,
                    qty: 5 // Exceeds stock limit of 2
                });

            expect(res.statusCode).toEqual(400);
        });

        it('should return 404 Not Found if product is not in the user\'s cart', async () => {
            const nonExistentProductId = new mongoose.Types.ObjectId().toString();
            await seedCart(validUserId, [
                {
                    productId: validProductId,
                    title: 'Wireless Headphones',
                    price: { amount: 2000, currency: 'INR' },
                    qty: 1
                }
            ]);

            const res = await request(app)
                .patch(`/cart/items/${nonExistentProductId}`)
                .send({
                    userId: validUserId,
                    qty: 2
                });

            expect(res.statusCode).toEqual(404);
        });
    });

    describe('DELETE /cart/items/:productId - Remove line', () => {
        it('should successfully remove the item from the cart', async () => {
            await seedCart(validUserId, [
                {
                    productId: validProductId,
                    title: 'Wireless Headphones',
                    price: { amount: 1500, currency: 'INR' },
                    qty: 2
                }
            ]);

            const res = await request(app)
                .delete(`/cart/items/${validProductId}`)
                .set('x-test-user-id', validUserId);

            expect(res.statusCode).toEqual(200);
            expect(res.body.items.length).toEqual(0);
            expect(res.body.totalAmount).toEqual(0);
            expect(res.body.totalItems).toEqual(0);

            // Verify in DB
            const cart = await Cart.findOne({ userId: validUserId });
            expect(cart.items.length).toEqual(0);
        });

        it('should return 404 if item does not exist in cart', async () => {
            await seedCart(validUserId, []);

            const res = await request(app)
                .delete(`/cart/items/${validProductId}`)
                .set('x-test-user-id', validUserId);

            expect(res.statusCode).toEqual(404);
        });
    });

    describe('DELETE /cart - Clear cart', () => {
        it('should successfully empty all items and reset totals', async () => {
            await seedCart(validUserId, [
                {
                    productId: validProductId,
                    title: 'Wireless Headphones',
                    price: { amount: 1500, currency: 'INR' },
                    qty: 2
                }
            ]);

            const res = await request(app)
                .delete('/cart')
                .set('x-test-user-id', validUserId);

            expect(res.statusCode).toEqual(200);
            expect(res.body.items).toEqual([]);
            expect(res.body.totalAmount).toEqual(0);
            expect(res.body.totalItems).toEqual(0);

            // Verify in DB
            const cart = await Cart.findOne({ userId: validUserId });
            expect(cart.items.length).toEqual(0);
            expect(cart.totalAmount).toEqual(0);
        });
    });
});
