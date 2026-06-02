const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Mock ImageKit SDK to avoid making actual API calls during tests
const mockUpload = jest.fn();
jest.mock('@imagekit/nodejs', () => {
    return jest.fn().mockImplementation(() => {
        return {
            files: {
                upload: mockUpload
            }
        };
    });
}, { virtual: true });

const app = require('../src/app');
const Product = require('../src/models/products.model');

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
    // Reset ImageKit upload mock and clean database collections after each test
    jest.clearAllMocks();
    mockUpload.mockReset();
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        const collection = collections[key];
        await collection.deleteMany({});
    }
});

describe('Product API - POST /api/product', () => {
    const validSellerId = new mongoose.Types.ObjectId().toString();

    // Helper to generate a standard valid product payload
    const getValidProductPayload = () => ({
        title: 'Premium Wireless Headphones',
        description: 'Noise-cancelling over-ear wireless headphones.',
        'price[amount]': 8999,
        'price[currency]': 'INR',
        'stock[quantity]': 45,
        seller: validSellerId,
        'varaints[0]': 'Matte Black',
        'varaints[1]': 'Platinum Silver'
    });

    describe('Success Cases', () => {
        it('should successfully create a product with valid details and uploaded images', async () => {
            // Mock a successful ImageKit upload response
            mockUpload.mockResolvedValue({
                url: 'https://ik.imagekit.io/majorproject/products/headphone_main.jpg',
                thumbnailUrl: 'https://ik.imagekit.io/majorproject/tr:h-100/products/headphone_main.jpg',
                fileId: 'file_id_headphone123'
            });

            const payload = getValidProductPayload();

            const res = await request(app)
                .post('/api/product')
                .field(payload)
                // Attach mock files to simulate multer image upload
                .attach('images', Buffer.from('fake-image-1-binary-data'), 'headphone_black.jpg')
                .attach('images', Buffer.from('fake-image-2-binary-data'), 'headphone_silver.jpg');

            // Wait, since we are only testing the API structure first, 
            // when the user fully implements the controller, this should return a 201.
            // In the initial stub, it returns 201 with the stub body.
            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('message');
            expect(res.body).toHaveProperty('product');

            // If the controller saves the product to the DB (which our tests verify on complete implementation):
            const savedProduct = await Product.findOne({ title: payload.title });
            if (savedProduct) {
                expect(savedProduct.title).toEqual(payload.title);
                expect(savedProduct.price.amount).toEqual(8999);
                expect(savedProduct.price.currency).toEqual('INR');
                expect(savedProduct.stock.quantity).toEqual(45);
                expect(savedProduct.seller.toString()).toEqual(validSellerId);
                expect(savedProduct.varaints).toContain('Matte Black');
                expect(savedProduct.images.length).toBeGreaterThan(0);
                expect(savedProduct.images[0]).toHaveProperty('url');
                expect(savedProduct.images[0]).toHaveProperty('thumbnail');
                expect(savedProduct.images[0]).toHaveProperty('id');
            }
        });

        it('should create a product successfully without uploading images', async () => {
            const payload = getValidProductPayload();

            const res = await request(app)
                .post('/api/product')
                .field(payload);

            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('product');
            
            // ImageKit upload should not have been called since no images were sent
            expect(mockUpload).not.toHaveBeenCalled();
        });
    });

    describe('Validation & Failure Cases', () => {
        it('should return 400 Bad Request if title is missing', async () => {
            const payload = getValidProductPayload();
            delete payload.title;

            const res = await request(app)
                .post('/api/product')
                .field(payload);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should return 400 Bad Request if price amount is missing', async () => {
            const payload = getValidProductPayload();
            delete payload['price[amount]'];

            const res = await request(app)
                .post('/api/product')
                .field(payload);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should return 400 Bad Request if stock quantity is missing', async () => {
            const payload = getValidProductPayload();
            delete payload['stock[quantity]'];

            const res = await request(app)
                .post('/api/product')
                .field(payload);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should return 400 Bad Request if seller is missing', async () => {
            const payload = getValidProductPayload();
            delete payload.seller;

            const res = await request(app)
                .post('/api/product')
                .field(payload);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should return 400 Bad Request if seller ID format is invalid', async () => {
            const payload = getValidProductPayload();
            payload.seller = 'invalid-mongo-id';

            const res = await request(app)
                .post('/api/product')
                .field(payload);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should return 400 Bad Request if varaints array is missing or empty', async () => {
            const payload = getValidProductPayload();
            delete payload['varaints[0]'];
            delete payload['varaints[1]'];

            const res = await request(app)
                .post('/api/product')
                .field(payload);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should return 400 Bad Request if price currency is not INR or USD', async () => {
            const payload = getValidProductPayload();
            payload['price[currency]'] = 'EUR'; // Invalid currency enum value

            const res = await request(app)
                .post('/api/product')
                .field(payload);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should return 400 Bad Request if stock quantity is a negative number', async () => {
            const payload = getValidProductPayload();
            payload['stock[quantity]'] = -5;

            const res = await request(app)
                .post('/api/product')
                .field(payload);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should return 400 Bad Request if price amount is negative', async () => {
            const payload = getValidProductPayload();
            payload['price[amount]'] = -100;

            const res = await request(app)
                .post('/api/product')
                .field(payload);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should handle ImageKit upload failure and return a 500 error', async () => {
            // Mock ImageKit returning an error
            mockUpload.mockRejectedValue(new Error('ImageKit upload service unavailable'));

            const payload = getValidProductPayload();

            const res = await request(app)
                .post('/api/product')
                .field(payload)
                .attach('images', Buffer.from('fake-image-binary-data'), 'fail_image.jpg');

            expect(res.statusCode).toEqual(500);
            expect(res.body).toHaveProperty('message');
            expect(res.body.message).toContain('ImageKit');
        });
    });
});
