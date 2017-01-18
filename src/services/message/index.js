'use strict';

const service = require('feathers-mongoose');
const Message = require('./message-model');
const hooks = require('./hooks');
const errors = require('feathers-errors');
const Util = require('../util');
const Resolve = require('../resolve');
const Orchestration = require('../orchestration');
const Notification = require('../notification/notification-model');
const Constants = require('../constants');

const docs = require('./docs.json')

class Service {

  constructor(options) {
    this.options = options || {};
    this.docs = docs;
  }

  get(id, params) {
    console.log('[INFO] get message ' + id);
    return Notification
      .find({'message': {$elemMatch: {_id: id}}})
      .then(notifications => {
        if (notifications.length === 0) {
          return {Error:'Unknown message id.'}; // TODO BadRequest
        }
        return notifications.map(function (notification) {
          return {
            user: notification.user,
            clicked: notification.state === Constants.NOTIFICATION_STATES.CLICKED
          };
        });
      })
      .catch(err=> {
        return new errors.BadRequest({errors: err});
      });
  }

  create(data, params) {
    if (!Util.isAllSet([data.title, data.body, data.token, data.scopeIds]))
      return Promise.reject(new errors.BadRequest('Parameters missing.'));

    let message = new Message(data);
    return Resolve
      .resolveUser(message.scopeIds).then(userIds => {
        // set resolved userIds
        message.userIds = userIds;
        return message.save()
      })
      .then(message => {
        // create notification for each user
        let notifications = message.userIds.reduce((notifications, userId) => {
          let notification = new Notification({
            message: message,
            user: userId
          }).save();
          return notifications.concat(notification);
        }, []);
        return Promise.all(notifications);
      })
      .then(notifications => {
        return Orchestration.orchestrate(notifications);
      })
      .then(()=> {
        return message; // TODO remove unnecessary data from model
      });
  }
}

module.exports = function () {
  const app = this;

  // Initialize our service with any options it requires
  app.use('/messages', new Service());

  // Get our initialize service to that we can bind hooks
  const messageService = app.service('/messages');

  // Set up our before hooks
  messageService.before(hooks.before);

  // Set up our after hooks
  messageService.after(hooks.after);
};

module.exports.Service = Service;
