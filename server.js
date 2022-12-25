if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config()
}
const mongoose = require('mongoose')
const express = require('express')
const app = express()
const bcrypt = require("bcrypt")
const passport = require('passport')
const flash = require("express-flash")
const session = require("express-session")
const methodOverride = require('method-override')
const sendSMS = require('./twilio-message')
//models
const User = require('./Models/User')
const Alert = require('./Models/Alert')

mongoose.connect(process.env.MONGOURI)

// const testAlert = new User({"name": "Ayush Shaw", "email": "ayush12@ayush.com", "password": "6.411", "phonenumber": "+91 9330622185"})
// testAlert.save().then(()=>{console.log("User saved", testAlert)})

const initializePassport = require('./passportconfig')
initializePassport(
    passport,
    async (email) => {
        return await User.find({"email": email})
    },
    async (id) => {
        const users = (await User.find({"_id": id}));
        const user = (users.length>0)?users[0]:null;
        console.log("find by id")
        console.log(user)
        return user
    }
)

const users = []

app.set('view-engine', 'ejs')
app.use(express.urlencoded({ extended: false }))
app.use(flash())
app.use(express.json())
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}))
app.use(passport.initialize())
app.use(passport.session())
app.use(methodOverride('_method'))
app.use(express.static('public'))

app.get('/', checkAuthenticated, async (req, res) => {
    console.log("email"+ req.user.email)
    const alerts = await Alert.find({"email": req.user.email})
    console.log("root")
    console.log(alerts)
    res.render('raisealert.ejs', { name: req.user.name , isRaised: (alerts.length !=  0)})
})

app.get('/login', checkNotAuthenticated, (req, res) => {
    res.render('login.ejs')
})

app.post('/login', checkNotAuthenticated, passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login',
    failureFlash: true
}))

app.get('/register', checkNotAuthenticated, (req, res) => {
    res.render('signup.ejs')
})
app.get('/alert', checkAuthenticated, async (req, res)=>{
    const alerts = await Alert.count({"email": req.user.email})
    res.render('raisealert.ejs', {name: req.user.name, isRaised: (alerts !=  0)})
})
app.get('/see-alert', checkAuthenticated, async (req, res)=>{
    let alerts = await Alert.find({})

    console.log("See all alerts")
    console.log(alerts)
    res.render('seealert.ejs', {name: req.user.name, alerts: alerts, isempty: alerts.length===0})
})
app.post('/alert', checkAuthenticated, async (req, res) => {
    console.log("alert raised")
    try{
        const name = req.user.name;
        const email = req.user.email;
        const latitude = req.body.latitude;
        const longitude = req.body.longitude;
        const pastalert = await Alert.count({"email": email})
        console.log(pastalert)
        if(pastalert>0){
            await Alert.deleteMany({"email": email})
        }
        const alert = new Alert({
            "name": name,
            "email": email,
            "latilude": latitude,
            "longitude": longitude
        })
        await alert.save();
        const getAllusers = await User.find({})
        getAllusers.forEach(item=>{
            sendSMS(`Alert from Save-your-friend!!, Your friend, ${req.user.name} is getting bullied.`, item.phonenumber)
        })
        res.json({
            "status": "OK"
        })
    } catch (e) {
        console.log(e.message)
        res.json({"status": "Error occured, failed to send message."})
    }
})
app.post('/close-alert', checkAuthenticated, async (req, res)=>{
    console.log("alert closed")
    try{
        const email = req.user.email;
        console.log(req.body)
        Alert.deleteMany({"email": email}).then(()=>{
            res.json({
                "status": "OK"
            })
        })
    } catch (e) {
        console.log(e.message)
        res.json({"status": "Error"})
    }
})
app.get('/individual-alert/:email', checkAuthenticated ,async (req, res)=>{
    const alertmail = req.params.email
    console.log(alertmail)
    const alertdata = await Alert.find({email: alertmail})
    console.log(alertdata)
    if(alertdata.length>0){
        let latitude = alertdata[0].latilude;
        let longitude = alertdata[0].longitude;
        res.render("individual_alert.ejs", {name: req.user.name, latitude: latitude, longitude: longitude})
    }else{
        res.redirect('/')
    }
    
})
app.post('/register', checkNotAuthenticated, async (req, res) => {
    try {
        console.log(req.body.password)
        if((await User.find({"email": req.body.email})).length>0){
            redirect('/register')
        }
        const hashedPassword = await bcrypt.hash(req.body.password, 10)
        const userentry = new User({
            "name": req.body.name,
            "email": req.body.email,
            "password": hashedPassword,
            "phonenumber": req.body.phonenumber
        })
        userentry.save().then(()=>{
            console.log("saved", userentry)
            res.redirect('/login')
        })
        
        // res.redirect('/login')
    } catch (e) {
        console.log(e.message)
        res.redirect('/register')
    }
})

app.delete('/logout', (req, res) => {
    req.logOut((err) => {

        if (err) {
            return next(err);
        }
        return res.redirect('/');

    })
})

function checkNotAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return res.redirect('/')
    }
    next()
}
function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next()
    }
    res.redirect('/login')
}

app.listen(process.env.PORT || 3000)