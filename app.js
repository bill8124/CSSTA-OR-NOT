/**
 * Module dependencies.
 */
var express = require('express');
var http = require('http');
var path = require('path');
var flash = require('connect-flash');
var mongoose = require('mongoose');
var passport = require('passport');

require('./config/passport'); // TODO [FB] : Passport configuration
require('./config/db'); // TODO [DB] : Connect to database


var app = express();
var Vote = mongoose.model('Vote'); // TODO [DB] : Get Vote model

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(express.cookieParser(process.env.COOKIE_SECRET));
app.use(express.session());

// https://github.com/jaredhanson/passport#middleware
app.use(passport.initialize());
app.use(passport.session());
// Session based flash messages
app.use(flash());

app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', function(req, res){
  var messages = req.flash('info');
  res.render('index', {messages: messages});
});

/* Stores vote option in session and invokes facebook authentication */
app.post('/vote', function(req, res, next){
  // Stores the voted option (conveted to number) into session
  req.session.vote = +req.body.vote;



  res.redirect('/result');

  // [FB] Redirect to passport auth url!
  // Directly invoke the passport authenticate middleware.
  // Ref: http://passportjs.org/guide/authenticate/
  passport.authenticate('facebook')(req, res, next);
});

// [FB] Facebook callback handler
// Ref: https://github.com/jaredhanson/passport-facebook/blob/master/examples/login/app.js#L100
app.get('/fbcb', passport.authenticate('facebook', {
  successRedirect:'/result',
  failureRedirect: '/'
}));

app.get('/result', function(req, res){
    var vote = req.session.vote, // The voted item (0~6)
        fbid = req.user && req.user.id; // [FB] Get user from req.user

    // Delete the stored session.
    delete req.session.vote;
    req.logout(); // Delete req.user

    // Redirect the malicious (not voted or not logged in) requests.
    if (vote === undefined || fbid === undefined){
        req.flash('info', "請先在此處投票。");
        return res.redirect('/');
    }

    var newVote = new Vote({vote: vote, fbid: fbid});
    Vote.find({fbid: fbid}, function(err, votes, count){
        if (votes.length > 0){
            console.log('updateVote ' + vote);
            if (votes[0].vote === vote){
                req.flash('info', "你已經投過票囉！");
            }
            else {
                req.flash('info', "你的投票已更新！");
            }
            Vote.update({fbid: fbid}, {vote: vote}, function(err, user){
                return computeResult(res, req);
            });
        }
        else {
            console.log('newVote ' + vote);
            newVote.save(function(err, newVote){
                return computeResult(res, req);
            });
        }
    });
});

function computeResult(res, req){
    Vote.aggregate({
        $group: {
            _id: "$vote",
            votesPerOption: { $sum : 1 },
        }
    }, function (err, result) {
        if (err) return handleError(err);
        var total = 0;
        var voteResult = [0, 0, 0, 0, 0, 0, 0];
        result.forEach(function(element, index, array){
            voteResult[+element._id] = element.votesPerOption;
            total += element.votesPerOption;
        });
        voteResult.forEach(function(element, index, array){
            voteResult[index] = 100.0 * voteResult[index] / total;
        });
        var messages = req.flash('info');
        res.render('result', {
            votes: voteResult, messages: messages // Percentages
        });
    });
}


http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
