var express = require('express');
var cfenv = require('cfenv');
var fs = require('fs');
var db = require('ibm_db');
var builder = require('xmlbuilder');

if (process.env.VCAP_SERVICES) {
    var env = JSON.parse(process.env.VCAP_SERVICES);
    db2 = env['sqldb'][0].credentials;
}
else {    
    console.error("DB2 credentials not found");
}

var dbConnection = "DRIVER={DB2};DATABASE=" + db2.db + ";UID=" + db2.username + ";PWD=" + db2.password + ";HOSTNAME=" + db2.hostname + ";port=" + db2.port;

var app = express();
app.use(express.static(__dirname + '/public'));

app.get('/static-menu/', function(req, res) {
    fs.readFile('alter_api_feed.xml', 'utf8', function(err, data) {
        if (!err) {
            res.set('Content-Type', 'text/xml');
            res.send(data);
        }
        else {
            console.log('alter_api_feed.xml file not found!');
            res.status(500).send('Server could not provide feed!');
        }
    });
});

app.get('/menu/', function(req, res) {
    fetchFromDB('SELECT * FROM MENU_CATEGORY', function(err, data) {
        if (!err) {
            var categories = data;

            fetchFromDB('SELECT * FROM MENU_ENTRY', function(err, data) {
                if (!err) {
                    var entries = data;

                    if (!categories || !entries) {
                        handleError(err, req, res);
                    }

                    res.set('Content-Type', 'text/xml');
                    res.send(generateFeed(categories, entries));
                } else {
                    handleError(err, req, res);
                }
            });
        } else {
            handleError(err, req, res);
        }
    });
});

function handleError(err, req, res) {
    res.status(500).send('Server could not provide feed!');
}

function fetchFromDB(query, fetch_handler) {
    db.open(dbConnection, function(err, conn) {
        if (err) {
            console.log(err);
            fetch_handler(err, undefined);
        } else {
            conn.query(query, function(err, data) {
                if (err) {
                    console.log(err);
                    fetch_handler(err, undefined);
                } else {
                    conn.close();
                    fetch_handler(err, data);
                }
            });
        }
    });
}

function generateFeed(categories, entries) {
    var doc = builder.create('rss', {'version': '1.0', 'encoding': 'UTF-8'}).att('xmlns:k', 'http://kinetise.com');
    var channel = doc.ele('channel');

    for (var i = 0; i < categories.length; ++i) {
        var item = channel.ele('item', {'k:context': 'cat_' + categories[i].CATEGORY_ID });
        item.ele('type', {}, 'Category');
        item.ele('name').dat(categories[i].NAME);

        var categoryEntries = entries.filter(function(e){ return e.CATEGORY_ID === categories[i].CATEGORY_ID; });

        for (var j = 0; j < categoryEntries.length; ++j) {
            var item = channel.ele('item', {'k:context': 'ent_' + categoryEntries[j].ENTRY_ID });
            item.ele('type', {}, 'Entry');
            item.ele('name').dat(categoryEntries[j].NAME);
            item.ele('price').dat(categoryEntries[j].PRICE + ' $');

            if (categoryEntries[j].IMAGE) {
                item.ele('image', {}, categoryEntries[j].IMAGE);
            }
        }
    }

    return doc.end({ pretty: true });
}

var appEnv = cfenv.getAppEnv();

app.listen(appEnv.port, appEnv.bind, function() {
  console.log("Kinetise starter application running on " + appEnv.url);
});