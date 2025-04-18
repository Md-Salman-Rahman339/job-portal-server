const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// MongoDB connection URI with updated parameters
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ieavp.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },

    retryWrites: true,
    w: 'majority'
});

// Middleware
app.use(cors({
    origin: [
        'http://localhost:5173',
        'https://job-portal-522ac.web.app',
        'https://job-portal-522ac.firebaseapp.com',
    ],
    credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

const logger = (req, res, next) => {
    console.log('inside the logger');
    next();
};

const verifyToken = (req, res, next) => {
    const token = req?.cookies?.token;

    if (!token) {
        return res.status(401).send({ message: 'Unauthorized access' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'Unauthorized access' });
        }
        req.user = decoded; // Attach decoded user to request
        next();
    });
};

async function run() {
    try {
        // Connect to MongoDB with error handling
        await client.connect();
        await client.db('admin').command({ ping: 1 });
        console.log('Successfully connected to MongoDB Atlas!');

        // MongoDB Collections
        const jobsCollection = client.db('jobPortal').collection('jobs');
        const jobApplicationCollection = client.db('jobPortal').collection('job_applications');

        // Routes
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });

            res
                .cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                })
                .send({ success: true });
        });

        app.get('/jobs', logger, async (req, res) => {
            const email = req.query.email;
            let query = {};
            if (email) {
                query = { hr_email: email };
            }
            const cursor = jobsCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });

        app.get('/jobs/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await jobsCollection.findOne(query);
            res.send(result);
        });

        app.post('/job-applications', verifyToken, async (req, res) => {
            const application = req.body;
            const result = await jobApplicationCollection.insertOne(application);
            const id = application.job_id;
            const query = { _id: new ObjectId(id) };
            const job = await jobsCollection.findOne(query);
            let newCount = job.applicationCount ? job.applicationCount + 1 : 1;

            // Update job info
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    applicationCount: newCount,
                },
            };

            await jobsCollection.updateOne(filter, updatedDoc);
            res.send(result);
        });

        app.get('/job-application', verifyToken, async (req, res) => {
            const email = req.query.email;
            const query = { applicant_email: email };

            // Token email !== query email check
            if (req.user.email !== req.query.email) {
                return res.status(403).send({ message: 'Forbidden access' });
            }

            const result = await jobApplicationCollection.find(query).toArray();

            // Add job details to applications
            for (const application of result) {
                const jobQuery = { _id: new ObjectId(application.job_id) };
                const job = await jobsCollection.findOne(jobQuery);
                if (job) {
                    application.title = job.title;
                    application.location = job.location;
                    application.company = job.company;
                    application.company_logo = job.company_logo;
                }
            }

            res.send(result);
        });

        app.post('/jobs', async (req, res) => {
            const newJob = req.body;
            const result = await jobsCollection.insertOne(newJob);
            res.send(result);
        });

        app.patch('/job-applications/:id', async (req, res) => {
            const id = req.params.id;
            const data = req.body;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    status: data.status,
                },
            };
            const result = await jobApplicationCollection.updateOne(filter, updatedDoc);
            res.send(result);
        });

    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
        process.exit(1); // Exit process if can't connect to DB
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}

run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Job is falling from the sky');
});

app.listen(port, () => {
    console.log(`Job is waiting at: ${port}`);
});
