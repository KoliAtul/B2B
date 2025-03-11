require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sequelize = require('./config'); // Ensure this points to your updated config file
const { DataTypes } = require('sequelize');
// Load environment variables

const app = express();
app.use(express.json());
app.use(cors());

const SECRET_KEY = process.env.SECRET_KEY; // Use secret key from .env
const PORT = process.env.PORT || 4000; // Use port from .env or default to 4000

// Define Models
const User = sequelize.define('User', {
    UserID: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    Name: { type: DataTypes.STRING, allowNull: false },
    Email: { type: DataTypes.STRING, unique: true, allowNull: false },
    PasswordHash: { type: DataTypes.STRING, allowNull: false },
    PhoneNumber: { type: DataTypes.STRING },
    Role: { type: DataTypes.ENUM('User', 'Admin'), defaultValue: 'User' },
    SubscriptionEndDate: { type: DataTypes.DATE },
    BookingsRemaining: { type: DataTypes.INTEGER, defaultValue: 100 },
}, { timestamps: true });

const Booking = sequelize.define('Booking', {
    BookingID: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    UserID: { type: DataTypes.INTEGER, allowNull: false },
    CabID: { type: DataTypes.INTEGER, allowNull: false },
    StartLocation: { type: DataTypes.STRING, allowNull: false },
    EndLocation: { type: DataTypes.STRING, allowNull: false },
    Status: { type: DataTypes.ENUM('Pending', 'Completed', 'Cancelled'), defaultValue: 'Pending' },
}, { timestamps: false });

const Cab = sequelize.define('Cab', {
    CabID: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    CabName: { type: DataTypes.STRING, allowNull: false },
    LicensePlate: { type: DataTypes.STRING, unique: true, allowNull: false },
    Capacity: { type: DataTypes.INTEGER, allowNull: false },
    Status: { type: DataTypes.ENUM('Available', 'Booked'), defaultValue:'Available' },
}, { timestamps:true });

const Note = sequelize.define('Note', {
    NoteID:{type :DataTypes.INTEGER , autoIncrement:true , primaryKey:true},
    BookingID:{type :DataTypes.INTEGER , allowNull:false},
    NoteText:{type :DataTypes.TEXT , allowNull:false},
},{timestamps:false});

// Relationships
Booking.hasMany(Note,{foreignKey:'BookingID'});
Note.belongsTo(Booking,{foreignKey:'BookingID'});
User.hasMany(Booking,{foreignKey:'UserID'});
Booking.belongsTo(User,{foreignKey:'UserID'});

sequelize.sync(); // Ensure the database is synced

// Middleware for JWT authentication
const authenticateJWT = (req,res,next) => {
    const token = req.header('Authorization')?.split(' ')[1];
    if (!token) return res.sendStatus(403);

    jwt.verify(token, SECRET_KEY,(err,user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// User registration
app.post('/users', async (req,res) => {
   try {
       const hashedPassword = await bcrypt.hash(req.body.PasswordHash , 10);
       const user = await User.create({...req.body , PasswordHash : hashedPassword });
       res.status(201).send({ id:user.UserID , msg:"User added successfully" });
   } catch (err) {
       console.error(err);
       res.status(500).send({ error:'Failed to add user' , details : err.message });
   }
});

// User login
app.post('/login', async (req,res) => {
   const user = await User.findOne({ where:{ Email:req.body.Email }});
    
   if (!user || !(await bcrypt.compare(req.body.PasswordHash , user.PasswordHash))) {
       return res.status(401).send({ error:'Invalid credentials' });
   }

   const token = jwt.sign({ id:user.UserID },SECRET_KEY);
   res.json({ token });
});

// Routes for Users
app.get('/users', authenticateJWT , async (req,res) => {
   try {
       const users = await User.findAll();
       res.send(users);
   } catch (err) {
       console.error(err);
       res.status(500).send({ error:'Failed to fetch users' , details : err.message });
   }
});

// Routes for Bookings
app.post('/bookings', authenticateJWT, async (req,res) => {
    const { UserID,CabID,StartLocation,EndLocation } = req.body;
    
    try {
        const cab = await Cab.findOne({ where:{ CabID , Status:'Available' }});
        if (!cab) return res.status(400).send({ error:'Cab is not available' });

        const user = await User.findByPk(UserID);
        if (user.BookingsRemaining <= 0 || new Date(user.SubscriptionEndDate) < new Date()) {
            return res.status(403).send({ error:'Subscription expired or booking limit reached' });
        }

        const booking = await Booking.create({ UserID,CabID , StartLocation , EndLocation });
        await user.update({ BookingsRemaining:user.BookingsRemaining - 1 });

        res.status(201).send({ msg:'Booking created successfully', booking });
        
    } catch (err) {
        console.error(err);
        res.status(500).send({ error:'Failed to create booking', details : err.message });
    }
});

app.post('/bookings/:id/notes', async (req, res) => {
    const { id } = req.params;
    const { NoteText } = req.body;

    try {
        const booking = await Booking.findByPk(id);
        if (!booking) {
            return res.status(404).send({ error: 'Booking not found' });
        }

        const note = await Note.create({ BookingID: id, NoteText });
        res.status(201).send({ msg: 'Note added successfully', note });
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: 'Failed to add note', details: err.message });
    }
});
app.get('/bookings/:id/notes', async (req, res) => {
    const { id } = req.params;

    try {
        const notes = await Note.findAll({ where: { BookingID: id } });
        res.send(notes);
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: 'Failed to fetch notes', details: err.message });
    }
});

// app.post('/bulk-bookings', async (req, res) => {
//     try {
//         const bookings = req.body; // Expect an array of bookings
//         for (const booking of bookings) {
//             const { UserID, CabID, StartLocation, EndLocation } = booking;

//             const cab = await Cab.findOne({ where: { CabID, Status: 'Available' } });
//             const user = await User.findByPk(UserID);

//             if (!cab || user.BookingsRemaining <= 0 || new Date(user.SubscriptionEndDate) < new Date()) {
//                 continue; // Skip invalid bookings
//             }

//             await Booking.create({ UserID, CabID, StartLocation, EndLocation });
//             await user.update({ BookingsRemaining: user.BookingsRemaining - 1 });
//         }
//         res.status(201).send({ msg: 'Bulk bookings created successfully' });
//     } catch (err) {
//         console.error(err);
//         res.status(500).send({ error: 'Failed to create bulk bookings', details: err.message });
//     }
// });




app.get('/bookings', async (req, res) => {
    try {
        const bookings = await Booking.findAll({
            include: [{ model: User, attributes: ['Name', 'Email'] }],
        });
        res.send(bookings);
    } catch (err) {
        console.error(err);x
        res.status(500).send({ error: 'Failed to fetch bookings', details: err.message });
    }
});

app.get('/bookings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Fetch the booking along with its associated notes
        const booking = await Booking.findByPk(id, {
            include: [
                { model: User, attributes: ['Name', 'Email'] },
                { model: Note, attributes: ['NoteText'] } 
            ]
        });

        if (!booking) {
            return res.status(404).send({ error: 'Booking not found' });
        }

        res.send({
            booking,
            notes: booking.Notes // This will return the notes associated with the booking
        });
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: 'Failed to fetch booking', details: err.message });
    }
});


app.delete('/bookings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await Booking.findByPk(id);
        if (!booking) return res.status(404).send({ error: 'Booking not found' });

        await booking.destroy();
        res.send({ msg: "Booking deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: 'Failed to delete booking', details: err.message });
    }
});

// Global Error Handler
app.use((err , req , res , next) => {
    console.error(err.stack);
    res.status(500).send({ error:'Something went wrong!' , details : err.message });
 });
 
 // Start Server
 app.listen(PORT , () => {
    console.log(`Server is running on port ${PORT}`);
 }); 