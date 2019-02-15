import 'mocha';
import chai from 'chai';
import spies from 'chai-spies';
import mongoose from 'mongoose';
import message from '@test/data/message';
import MessageService from '@/services/MessageService';
import DeviceService from '@/services/DeviceService';
import device from '@test/data/device';
import Utils from '@/utils';
import config from '@test/config';
import TestUtils from '@test/test-utils';

// Add extensions to chai
chai.use(spies);
const expect = chai.expect;

const SERVICE = 'firebase';

describe('EscalationLogic.escalate', () => {

  // Instantiate the service
  const messageService = new MessageService();

  before('should establish a database connection.', (done) => {
    // connect to database
    const db = mongoose.connection;
    db.on('error', console.error.bind(console, 'connection error:'));
    db.once('open', done);
    mongoose.connect(config.MONGO_DB_PATH);
  });

  it('should call the escalation logic.', async () => {
    // add test device
    await DeviceService.addDevice(device.platform, device.userId, device.tokens[0], SERVICE);

    // use spies for push and mail service
    const spyFunctionPush = chai.spy();
    const spyFunctionMail = chai.spy();
    (messageService as any).escalationLogic.pushService.send = spyFunctionPush;
    (messageService as any).escalationLogic.mailService.send = spyFunctionMail;

    await messageService.send(message);

    // wait for async calls have been called
    await TestUtils.timeout(500);
    expect(spyFunctionPush)
      .to.have.been.called();

    const config = Utils.getPlatformConfig(message.platform);

    await TestUtils.timeout(config.mail.defaults.delay + 10);
    expect(spyFunctionMail)
      .to.have.been.called();
  });

  after('should drop database and close connection', (done) => {
    mongoose.connection.db.dropDatabase(() => {
      mongoose.connection.close(done);
    });
  });

});
