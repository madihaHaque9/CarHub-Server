const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const morgan = require('morgan')
const port = process.env.PORT || 5000
const stripe= require('stripe')(process.env.PAYMENT_SECRET_KEY)


// middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174','https://carhub-df07b.web.app'],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())
app.use(morgan('dev'))
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token
  console.log(token)
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err)
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded
    next()
  })
}
// const sendEmail = (emailAddress, emailData) => {
//   //Create a transporter
//   const transporter = nodemailer.createTransport({
//     service: 'gmail',
//     host: 'smtp.gmail.com',
//     port: 587,
//     secure: false,
//     auth: {
//       user: process.env.MAIL,
//       pass: process.env.PASS,
//     },
//   })

//   //verify connection
//   transporter.verify((error, success) => {
//     if (error) {
//       console.log(error)
//     } else {
//       console.log('Server is ready to take our emails', success)
//     }
//   })

//   const mailBody = {
//     from: process.env.MAIL,
//     to: emailAddress,
//     subject: emailData?.subject,
//     html: `<p>${emailData?.message}</p>`,
//   }

//   transporter.sendMail(mailBody, (error, info) => {
//     if (error) {
//       console.log(error)
//     } else {
//       console.log('Email sent: ' + info.response)
//     }
//   })
// }

const uri=`mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.m69k4ra.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})
async function run() {
  
 
  try {
    const usersCollection = client.db("CarHub").collection("users");
    const carsCollection = client.db("CarHub").collection("cars");
    const bookingsCollection = client.db("CarHub").collection("bookings");
    // admin 
    const verifyAdmin= async(req,res,next)=>{
      const user= req.user
      const query={email: user?.email}
      const result= await usersCollection.findOne(query)
      if(!result || result?.role !== 'admin') return res.status(401).send({message:'unauthorized access for entering as an admin'})
      next()
    }
    const verifyOwner= async(req,res,next)=>{
      const user= req.user
      const query={email: user?.email}
      const result= await usersCollection.findOne(query)
      if(!result || result?.role !== 'owner') return res.status(401).send({message:'unauthorized access for entering as a owner'})
      next()
    }
    // auth related api
    app.post('/jwt', async (req, res) => {
      const user = req.body
      console.log('I need a new jwt', user)
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '365d',
      })
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true })
    })

    // Logout
    app.get('/logout', async (req, res) => {
      try {
        res
          .clearCookie('token', {
            maxAge: 0,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          })
          .send({ success: true })
        console.log('Logout successful')
      } catch (err) {
        res.status(500).send(err)
      }
    })

    
    app.put('/users/:email', async (req, res) => {
      const email = req.params.email
      const user = req.body
      const query = { email: email }
      const options = { upsert: true }
      const isExist = await usersCollection.findOne(query)
      console.log('User found?----->', isExist)
      if (isExist){
        if(user?.status=== 'Requested'){
          const result= await usersCollection.updateOne(
            query,
            {
              $set:
                user
              },
              options
            
          )
          return res.send(result)

        }
        else {
          return res.send(isExist)
        }
      }
      const result = await usersCollection.updateOne(
        query,
        {
          $set: { ...user, timestamp: Date.now() },
        },
        options
      )
      res.send(result)
    })
    app.get('/user/:email',async(req,res)=>{
      const email=req.params.email;
      const result= await usersCollection.findOne({email})
      res.send(result)
    })
   app.get('/cars',async(req,res)=>{
    const result=await carsCollection.find().toArray();
    res.send(result);
   })
   app.get('/cars/:email',verifyToken,verifyOwner,async(req,res)=>{
    const email= req.params.email;
    const result  = await carsCollection.find({'owner.email':email}).toArray()
    res.send(result);
   })
   app.get('/car/:id',async(req,res)=>{
    const id=req.params.id;
    const result= await carsCollection.findOne({_id:new ObjectId(id) })
    res.send(result);
   })
   app.post('/cars',verifyToken,async(req,res)=>{
    const car=req.body;
    const result=await carsCollection.insertOne(car);
    res.send(result);
   })
   app.post('/create-payment-intent',async(req,res)=>{
    const {price}= req.body
    const amount= parseInt(price*100)
    if(!price || amount < 1) return
    const {client_secret}= await stripe.paymentIntents.create({
      amount: amount,
      currency: 'usd',
      payment_method_types : ['card']
    })
    res.send({clientSecret : client_secret})
   })
  //  save booking info
   app.post('/bookings',verifyToken,async(req,res)=>{
    const booking= req.body;
    const result= await bookingsCollection.insertOne(booking)
  
    res.send(result)
   })
   app.patch('/cars/status/:id',async(req,res)=>{
    const id= req.params.id
    const status= req.body.status
    const query= {_id: new ObjectId(id)}
    const updateDoc={
      $set: {
        booked: status,
      },
    }
    const result= await carsCollection.updateOne(query,updateDoc)
    res.send(result)
   })
   app.get('/bookings',verifyToken,async(req,res)=>{
    const email= req.query.email
    if(!email) return res.send([])
    const query={'passenger.email':email}
    const result= await bookingsCollection.find(query).toArray()
    res.send(result)
   })
   app.get('/bookings/owner',verifyToken,verifyOwner,async(req,res)=>{
    const email= req.query.email
    if(!email) return res.send([])
    const query={owner:email}
    const result= await bookingsCollection.find(query).toArray()
    res.send(result)
   })
   app.delete('/bookings/:id', verifyToken, async (req, res) => {
    const id = req.params.id
    const query = { _id: new ObjectId(id) }
    const result = await bookingsCollection.deleteOne(query)
    res.send(result)
  })
   app.get('/users',verifyToken,verifyAdmin,async (req,res)=>{
    const result= await usersCollection.find().toArray()
    res.send(result)
   })
   app.put('/users/update/:email',verifyToken,async(req,res)=>{
    const email= req.params.email
    const user= req.body
    const query= {email: email}
    const options= {upsert : true}
    const updateDoc={
      $set:{
        ...user,timestamp: Date.now()
      }
      
    }
    const result= await usersCollection.updateOne(query,updateDoc,options)
    res.send(result)
   })
   app.get('/admin-stat', verifyToken, verifyAdmin, async (req, res) => {
    const bookingsDetails = await bookingsCollection
      .find({}, { projection: { date: 1, price: 1 } })
      .toArray()
    const userCount = await usersCollection.countDocuments()
    const carCount = await carsCollection.countDocuments()
    const totalSale = bookingsDetails.reduce(
      (sum, data) => sum + data.price,
      0
    )

    const chartData = bookingsDetails.map(data => {
      const day = new Date(data.date).getDate()
      const month = new Date(data.date).getMonth() + 1
      return [day + '/' + month, data.price]
    })
    chartData.unshift(['Day', 'Sale'])
    res.send({
      totalSale,
      bookingCount: bookingsDetails.length,
      userCount,
      carCount,
      chartData,
    })
  })

  
    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from CarHub Server..')
})

app.listen(port, () => {
  console.log(`CarHub is running on port ${port}`)
})
