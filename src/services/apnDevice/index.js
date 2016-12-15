'use strict';

const hooks = require('./hooks');
const error = require('feathers-errors');
const spawn = require('child_process').spawn;
const fs = require('fs');
const crypto = require('crypto');
const zip = require('express-zip');

// password for certificate
const password = require('../../certificates/config.json').password;

// paths
const certPath = __dirname + '/../../certificates';
const iconsetPath = __dirname+'/../../pushPackage/icon.iconset';

// website.json content
const websiteName = 'Schul-Cloud';
const websitePushID = 'web.org.schul-cloud';
const urlFormatString = 'https://schul-cloud.org/';
const webServiceURL = 'https://schul-cloud.org:3030/';
const allowedDomains = [urlFormatString];

class Service {
  constructor() {
    this.createPushPackage = this.createPushPackage.bind(this);
  }

  register(req, res) {
    let userId = req.headers.authorization.split(' ')[1];
    let token = req.params.deviceToken;

    req.app.service('/devices')
      .create({
        user_token: userId,
        service_token: token,
        type: 'web',
        service: 'apn',
        name: 'Safari',
        OS: 'safari'
      })
      .then(userWithNewDevice => {
        res.send(201, userWithNewDevice);
      })
      .catch((err) => {
        res.send(500, err);
      })
  }

  delete(req, res) {
    let userId = req.headers.authorization.split(' ')[1];
    res.send(200);
    // TOOD: not yet implemented in device service
    //req.app.service('/devices')
    // .delete();
  }

  checkAuthorization(req, res, next) {
    if (!req.headers.authorization) {
      res.send(new error.BadRequest('Missing authorization.'));
      return;
    }

    let authorization = req.headers.authorization.split(' ');
    if (authorization[0] !== 'ApplePushNotifications') {
      res.send(new error.BadRequest('Invalid authorization.'));
      return;
    }

    // TODO: check if user id is in our database

    next();
  }

  checkWebsitePushID(req, res, next) {
    if (req.params.websitePushID !== websitePushID) {
      res.send(new error.NotFound('Invalid websitePushID.'));
    } else {
      next();
    }
  }

  createPushPackage(req, res, next) {
    const tempPrefix = '/tmp/pushPackage-';
    let token = req.body.userId; // this must be in the user info dictionary

    fs.mkdtemp(tempPrefix, (err, tempDir) => {
      if (err) {
        res.send(new error.GeneralError('Unable to create pushPackage.'));
        return;
      }

      // save this, so we can delete it later
      req.tempDir = tempDir;

      this._createWebsiteJSON(tempDir, token)
        .then((tempDir) => {
          return this._createManifest(tempDir);
        })
        .then((tempDir) => {
          return this._createSignature(tempDir);
        })
        .then((tempDir) => {
          res.zip([
            // TODO: maybe a more compact way to do this
            { path: iconsetPath + '/icon_16x16.png', name: '/icon.iconset/icon_16x16.png' },
            { path: iconsetPath + '/icon_16x16@2x.png', name: '/icon.iconset/icon_16x16@2x.png' },
            { path: iconsetPath + '/icon_32x32.png', name: '/icon.iconset/icon_32x32.png' },
            { path: iconsetPath + '/icon_32x32@2x.png', name: '/icon.iconset/icon_32x32@2x.png' },
            { path: iconsetPath + '/icon_128x128.png', name: '/icon.iconset/icon_128x128.png' },
            { path: iconsetPath + '/icon_128x128@2x.png', name: '/icon.iconset/icon_128x128@2x.png' },
            { path: tempDir + '/website.json', name: '/website.json' },
            { path: tempDir + '/manifest.json', name: '/manifest.json' },
            { path: tempDir + '/signature', name: '/signature' }
          ], 'pushPackage.zip', (err) => {
            next();
            return Promise.resolve(tempDir);
          });
        })
        .catch((error) => {
          res.data = new error.GeneralError('Unable to create pushPackage.');
          next();
        });
    });
  }

  _createWebsiteJSON(dir, token) {
    return new Promise((resolve, reject) => {
      fs.writeFile(dir + '/website.json', JSON.stringify({
        websiteName: websiteName,
        websitePushID: websitePushID,
        allowedDomains: allowedDomains,
        urlFormatString: urlFormatString,
        authenticationToken: token,
        webServiceURL: webServiceURL
      }), (err) => {
        if (err) reject(err);
        resolve(dir);
      });
    });
  }

  _createManifest(dir) {
    return new Promise((resolve, reject) => {
      let manifest = {};

      // read iconset directory
      fs.readdir(iconsetPath, (err, files) => {
        if (err) {
          reject(err);
        }

        // create hash for website.json
        let hash = crypto.createHash('SHA1');
        hash.setEncoding('hex');
        hash.write(fs.readFileSync(dir + '/' + 'website.json'));
        hash.end();
        manifest['webiste.json'] = hash.read();

        // create hashes for iconset
        files.forEach((file) => {
          let hash = crypto.createHash('SHA1');
          hash.setEncoding('hex');
          hash.write(fs.readFileSync(iconsetPath + '/' + file));
          hash.end();
          manifest['icon.iconset/' + file] = hash.read();
        });

        // write manifest to file
        fs.writeFile(dir + '/manifest.json', manifest, (err) => {
          if (err) reject(err);
          resolve(dir);
        });
      });
    });
  }

  _createSignature(dir) {
    return new Promise((resolve, reject) => {
      const cert = '' + certPath + '/cert.pem';
      const key = '' + certPath + '/key.pem';
      const intermediate = certPath + '/intermediate.pem';
      const manifest = '' + dir + '/manifest.json';
      const signature = '' + dir + '/signature';

      const args = [
        'smime', '-sign', '-binary',
        '-in', manifest,
        '-out', signature,
        '-signer', cert,
        '-inkey', key,
        '-certfile', intermediate,
        '-passin', 'pass:' + password
      ];

      let process = spawn('openssl', args);
      process.on('close', (code) => {
        if (code !== 0) {
          reject('Unable to create signature. Exited with code ' + code + '.')
        } else {
          resolve(dir);
        }
      })
    });
  }

  cleanTempDir(req, res) {
    fs.unlink(req.tempDir, (err) => {
      if (err) console.log(err);
    });
  }
}

module.exports = function(){
  const app = this;
  const service = new Service();

  app.post('/:version/devices/:deviceToken/registrations/:websitePushID',
    service.checkWebsitePushID,
    service.checkAuthorization,
    service.register);
  app.delete('/:version/devices/:deviceToken/registrations/:websitePushID',
    service.checkWebsitePushID,
    service.checkAuthorization,
    service.delete);

  app.post('/:version/pushPackage/:websitePushID',
    service.checkWebsitePushID,
    service.createPushPackage,
    service.cleanTempDir
  );
};

module.exports.Service = Service;
