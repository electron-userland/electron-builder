import { expect } from 'chai';
import { spy } from 'sinon';
import {
  _callOnClient,
  addBreadcrumb,
  captureEvent,
  captureException,
  captureMessage,
  clearScope,
  getCurrentClient,
  popScope,
  pushScope,
  setExtraContext,
  setTagsContext,
  setUserContext,
  withScope,
} from '../../src';
import { init, TestClient, TestClient2 } from '../mocks/client';

declare var global: any;

describe('Shim', () => {
  beforeEach(() => {
    global.__SENTRY__ = {
      shim: undefined,
      stack: [],
    };
  });

  it('captures an exception', () => {
    const client = {
      captureException: spy(async () => Promise.resolve()),
    };
    withScope(client, () => {
      const e = new Error('test exception');
      captureException(e);
      expect(client.captureException.getCall(0).args[0]).to.equal(e);
    });
  });

  it('captures a message', () => {
    const client = {
      captureMessage: spy(async () => Promise.resolve()),
    };
    withScope(client, () => {
      const message = 'yo';
      captureMessage(message);
      expect(client.captureMessage.getCall(0).args[0]).to.equal(message);
    });
  });

  it('captures an event', () => {
    const client = {
      captureEvent: spy(async () => Promise.resolve()),
    };
    withScope(client, () => {
      const e = { message: 'test' };
      captureEvent(e);
      expect(client.captureEvent.getCall(0).args[0]).to.equal(e);
    });
  });

  it('sets the user context', () => {
    const client = {
      setContext: spy(),
    };
    pushScope(client);
    setUserContext({ id: '1234' });
    expect(client.setContext.getCall(0).args[0]).to.deep.equal({
      user: { id: '1234' },
    });
    popScope();
  });

  it('should set extra context', () => {
    const client = {
      setContext: spy(),
    };
    pushScope(client);
    setExtraContext({ id: '1234' });
    expect(client.setContext.getCall(0).args[0]).to.deep.equal({
      extra: { id: '1234' },
    });
    popScope();
  });

  it('sets the tags context', () => {
    const client = {
      setContext: spy(),
    };
    pushScope(client);
    setTagsContext({ id: '1234' });
    expect(client.setContext.getCall(0).args[0]).to.deep.equal({
      tags: { id: '1234' },
    });
    popScope();
  });

  it('clears the scope', () => {
    const client = {
      getInitialScope: () => ({ context: {} }),
      setContext: (nextContext: any, scope: any) => {
        const sc = scope.context;
        sc.user = { ...nextContext.user };
      },
    };
    withScope(client, () => {
      expect(global.__SENTRY__.stack.length).to.equal(2);
      setUserContext({ id: '1234' });
      expect(global.__SENTRY__.stack[1].scope).to.deep.equal({
        context: { user: { id: '1234' } },
      });
      clearScope();
      expect(global.__SENTRY__.stack[1].scope).to.deep.equal({
        context: {},
      });
    });
  });

  it('adds a breadcrumb', () => {
    const client = {
      addBreadcrumb: spy(),
    };
    pushScope(client);
    addBreadcrumb({ message: 'world' });
    expect(client.addBreadcrumb.getCall(0).args[0]).to.deep.equal({
      message: 'world',
    });
    popScope();
  });

  it('returns undefined before binding a client', () => {
    expect(getCurrentClient()).to.be.undefined;
  });

  it('returns the bound client', () => {
    init({});
    expect(getCurrentClient()).to.equal(TestClient.instance);
  });

  it('calls a function on the client', done => {
    const s = spy(TestClient.prototype, 'mySecretPublicMethod');
    withScope(new TestClient({}), () => {
      _callOnClient('mySecretPublicMethod', 'test');
      expect(s.getCall(0).args[0]).to.equal('test');
      s.restore();
      done();
    });
  });

  it('does not throw an error when pushing different clients', () => {
    init({});
    expect(() => {
      withScope(new TestClient2(), () => {
        //
      });
    }).to.not.throw();
  });

  it('does not throw an error when pushing same clients', () => {
    init({});
    expect(() => {
      withScope(new TestClient({}), () => {
        //
      });
    }).to.not.throw();
  });
});
