var database = require('../../database.js');
var util = require('../util.js');
var Promise = require('node-promise').Promise;

function getDownloads(user) {
    var p = new Promise();

    function resolve(servers) {
        p.resolve(servers);
    }

    function reject(err) {
        p.reject(err);
    }

    database(function(err, models) {
        if (err) {
            return reject(err);
        }
        models.Download.all().success(resolve).error(reject);
    });
    return p;
}

function convertDownloadsForView(downloads, user) {
    var ret = [];
    downloads.forEach(function(download) {
        ret.push({
            id: download.id,
            path: download.path,
            canDelete: user.isAdmin || download.UserId === user.id ? true : false
        });
    });

    return ret;
}

function getDownloadWithId(req, id, permissive) {
    var p = new Promise();

    function resolve(servers) {
        if (servers.length > 0) {
            p.resolve(servers[0]);
        } else {
            p.reject();
        }
    }

    function reject(err) {
        p.reject(err);
    }

    if (req.session.user.isAdmin || permissive) {
        database(function(err, models) {
            if (err) {
                return reject(err);
            }
            models.Download.findAll({
                where: {
                    id: id
                }
            }).success(resolve).error(reject);
        });
    } else {
        req.session.user.getDownloads({
            where: {
                id: id
            }
        }).success(resolve).error(reject);
    }

    return p;
}

function sendDownloadList(res, user) {
    user.getDownloads().success(function(downloads) {
        res.render(
            'downloads-list',
            { downloads: convertDownloadsForView(downloads, user) },
            function(err, content) {
                if (err) {
                    return util.sendError(res, err);
                }
                res.json({ type: 'success', content: content });
            }
        );
    }).error(function(err) {
        util.sendError(res, err);
    });
}

module.exports.apply = function(dependencies, app) {

    app.post('/downloads', function(req, res) {
        getDownloads(req.session.user).then(function(downloads) {
            res.render(
                'downloads',
                {
                    downloads: convertDownloadsForView(downloads, req.session.user)
                },
                function(err, content) {
                    if (err) {
                        return util.sendError(res, err);
                    }
                    res.json({content: content});
                }
                );
        }, function(err) {
            util.sendError(res, err);
        });
    });

    app.post('/downloads/status', function(req, res) {
        if (!req.body || !req.body.id) {
            return util.sendError(res, 'Invalid request!');
        }
        getDownloadWithId(req, req.body.id, true).then(function(download) {
            dependencies.downloadManager.getDownloadStatus(req.body.id).then(function(status) {
                var content = {
                    transferred: 0,
                    rate: 0,
                    active: false,
                    progress: 0,
                    status: 'Idle'
                };
                var msgs = [];

                if (status.active) {
                    content.active = true;
                    msgs.push('Downloading');
                }

                if (status.downloadStatus) {
                    var dls = status.downloadStatus;
                    if (dls.percent) {
                        content.progress = dls.percent;
                    }

                    if (dls.bytes) {
                        content.transferred = util.convertToHumanReadableSize(dls.bytes);
                    }

                    if (dls.rate) {
                        content.rate = dls.rate || '';
                    }
                }

                if (status.fileStatus) {
                    msgs.push('' + status.fileStatus.left + ' left (' + status.fileStatus.total + ' total)');
                }

                if (status.complete) {
                    msgs.push('Complete');
                    content.progress = 100;
                    content.rate = '';
                }

                if (status.serverOffline) {
                    msgs.push('Server offline');
                }

                if (status.noMatchingServer) {
                    msgs.push('No matching server found');
                }

                if (status.queued) {
                    var msg = 'Queued';
                    if (status.queuePosition !== undefined) {
                        msg += ' (' + status.queuePosition + ')';
                    }
                    msgs.push(msg);
                }

                content.status = msgs.length > 0 ? msgs.join(',') : content.status;
                res.json({ type: 'success', content: content });
            }, function(status) {
                util.sendError(res, status);
            });
        }, function() {
            util.sendError(res, 'Download not found!');
        });
    });

    app.post('/downloads/del', function(req, res) {
        if (!req.body || req.body.id === undefined) {
            return util.sendError(res, 'Invalid Request!');
        }

        getDownloadWithId(req, req.body.id).then(function(download) {
            res.render(
                'downloads-delete',
                { 
                    path: download.path,
                    id: download.id
                },
                function(err, content) {
                    res.json({ type: 'success', content: content });
                }
            );
        }, function() {
            util.sendError(res, 'Download not found!');
        });
    });

    app.post('/downloads/del-confirm', function(req, res) {
        if (!req.body || req.body.id === undefined) {
            return util.sendError(res, 'Invalid Request!');
        }

        getDownloadWithId(req, req.body.id).then(function(download) {
            dependencies.downloadManager.delDownload(download.id).then(function() {
                database(function(err, models) {
                    if (err) {
                        return util.sendError(res, err);
                    }

                    models.Download.count({
                        where: {
                            UserId: req.session.user.id
                        }
                    }).success(function(c) {
                        if (c > 0) {
                            util.sendSuccess(res);
                        } else {
                            sendDownloadList(res, req.session.user);
                        }
                    }).error(function(err) {
                        util.sendError(res, err);
                    });
                });
            });
        }, function() {
            util.sendError(res, 'Download not found!');
        });
    });
};
