var database = require('../../database.js');
var fs = require('fs');
var crypto = require('crypto');
var config = require('../../config.js');

function sendError(res, msg) {
    msg = msg || 'There was an error saving your server.';
    res.render(
        'error-box',
        { message: msg },
        function(err, content) {
            res.json({ type: 'error', content: content});
        }
    );
}

function getKeyPath(filename) {
    return config.keydir + '/' + filename;
}

function convertServersForView(servers) {
    var ret = [];
    servers.forEach(function(server) {
        ret.push({
            id: server.id,
            username: server.username,
            hostname: server.hostname,
            path: server.path,
            pubkey: '' + fs.readFileSync(getKeyPath(server.keyfile))
        });
    });

    return ret;
}

function getUserAndModels(userid, cb) {
    database(function(err, models) {
        models.User.find({
            where: {
                id: userid
            }
        }).success(function(user) {
            cb(user, models);
        }).error(function() {
            sendError(res);
        });
    });
}

function sendServerList(res, user) {
    user.getServers().success(function(servers) {
        servers = convertServersForView(servers);
        res.render(
            'servers-list',
            { servers: servers },
            function(error, content) {
                res.json({ type: 'success', content: content });
            }
        );
    }).error(function() {
        sendError(res);
    });
}

module.exports.apply = function(app) {
    app.post('/servers', function(req, res) {
        getUserAndModels(req.session.user.id, function(user, models) {
            user.getServers().success(function(servers) {
                res.render(
                    'servers',
                    { servers: convertServersForView(servers) },
                    function(err, content) {
                        if (err) {
                            return sendError(res);
                        }
                        res.json({content: content});
                    }
                );
            }).error(function() {
                sendError(res);
            });
        });
    });

    app.post('/servers/add', function(req, res) {
        var username = req.body.username;
        if (username === '' || username === undefined) {
            return sendError(res, 'Username must not be empty!');
        }

        var hostname = req.body.hostname;
        if (hostname === '' || username === undefined) {
            return sendError(res, 'Hostname must not be empty!');
        }

        var path = req.body.path;
        if (path === '' || path === undefined) {
            return sendError(res, 'Path must not be empty!');
        }

        var pubkey = req.body.pubkey;
        if (pubkey === '' || pubkey === undefined) {
            return sendError(res, 'Pubkey must not be empty!');
        }

        getUserAndModels(req.session.user.id, function(user, models) {
            var md5 = crypto.createHash('md5');
            md5.update(pubkey);
            var filename = md5.digest('hex');
            fs.writeFileSync(getKeyPath(filename), pubkey);

            var server = models.Server.build({
                username: username,
                hostname: hostname,
                path: path,
                keyfile: filename
            });

            user.addServer(server).success(function() {
                sendServerList(res, user);
            }).error(function() {
                sendError(res);
            });
        });
    });

    app.post('/servers/del', function(req, res) {
        if (!req.body || !req.body.id) {
            return sendError(res);
        }

        getUserAndModels(req.session.user.id, function(user, models) {
            user.getServers({
                where: {
                    id: req.body.id
                }
            }).success(function(servers) {
                if (servers.length === 0) {
                    res.json({ type: 'error', content: 'Server not found!'});
                }
                var keyfile = servers[0].keyfile;
                user.removeServer(servers[0]).success(function() {
                    fs.unlink(getKeyPath(keyfile));
                    sendServerList(res, user);
                });
            });
        });
    });
};
