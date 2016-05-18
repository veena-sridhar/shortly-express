var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var bcrypt = require('bcrypt-nodejs');


var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');
var session = require('express-session');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));
app.use(session({
  secret: 'shhhh this is secret!',
  saveUninitialized: false,
  resave: true
}));

app.get('/', util.checkUser, function(req, res) {
    res.render('index');
});

app.get('/create', util.checkUser, function(req, res) {
  res.render('index');
});

app.get('/links', util.checkUser, function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.status(200).send(links.models);
  });
});

app.post('/links', util.checkUser, function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin
        })
        .then(function(newLink) {
          res.status(200).send(newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

app.get('/login', 
function(req, res) {
  res.render('login');
});

app.post('/login', function(req, res) {
  var username = req.body.username;
  var password = req.body.password;

  var hashedPW = bcrypt.hashSync(password);

  new User({username: username}).fetch().then(function (user) {
    if (!user) {
      res.redirect('/login');
    } else {
      bcrypt.compare(password, hashedPW, function (err, match) {
        console.log('>>>> match: ', match);
        if (match) {
          util.createSession(req, res, user);
        } else {
          //log them in and create a new session
          res.redirect('/login');
        }

      })
    }
  })
});

app.get('/signup', 
function(req, res) {
  res.render('signup');
});

app.post('/signup', function(req, res) {
  //get the username and password from the request
  var username = req.body.username;
  var password = req.body.password;
  //create a new user using the new consructor
  new User({username: username}).fetch().then(function (user) {
    if (user) {
      console.log('This username already exists. Please pick another one.');
      res.redirect('/signup');
    } else {
      //hash and salt the password and store to the database as well
      bcrypt.hash(password, null, null, function(err, hash) {
          if (err) {
            res.redirect('/signup');
          } else {
          //then add the req's username to the table's username
            Users.create({
              username: username,
              password: hash
            }).then(function (user) {
              util.createSession(req, res, user);
            });
          }
      });
    }
  })
});


/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
