import * as util from './util/index.mjs';
import * as is from './is.mjs';
import Event from './event.mjs';

const eventRegex = /^([^.]+)(\.(?:[^.]+))?$/; // regex for matching event strings (e.g. "click.namespace")
const universalNamespace = '.*'; // matches as if no namespace specified and prevents users from unbinding accidentally

const defaults = {
  qualifierCompare: function( q1, q2 ){
    return q1 === q2;
  },
  eventMatches: function( /*context, listener, eventObj*/ ){
    return true;
  },
  addEventFields: function( /*context, evt*/ ){
  },
  callbackContext: function( context/*, listener, eventObj*/ ){
    return context;
  },
  beforeEmit: function(/* context, listener, eventObj */){
  },
  afterEmit: function(/* context, listener, eventObj */){
  },
  bubble: function( /*context*/ ){
    return false;
  },
  parent: function( /*context*/ ){
    return null;
  },
  context: null
};

let emptyOpts = {};

function Emitter( opts = emptyOpts, context ){
  this._opts = Object.assign({}, opts);
  this.context = context || opts.context || null;
  this.listeners = null; // lazily allocated on first .on() call
  this.emitting = 0;
}

let p = Emitter.prototype;

let forEachEvent = function( self, handler, events, qualifier, callback, conf, confOverrides ){
  if( is.fn( qualifier ) ){
    callback = qualifier;
    qualifier = null;
  }

  if( confOverrides ){
    if( conf == null ){
      conf = confOverrides;
    } else {
      conf = util.assign( {}, conf, confOverrides );
    }
  }

  let eventList = is.array(events) ? events : events.split(/\s+/);

  for( let i = 0; i < eventList.length; i++ ){
    let evt = eventList[i];

    if( is.emptyString( evt ) ){ continue; }

    let match = evt.match( eventRegex ); // type[.namespace]

    if( match ){
      let type = match[1];
      let namespace = match[2] ? match[2] : null;
      let ret = handler( self, evt, type, namespace, qualifier, callback, conf );

      if( ret === false ){ break; } // allow exiting early
    }
  }
};

let makeEventObj = function( self, obj ){
  (self._opts.addEventFields || defaults.addEventFields)( self.context, obj );

  return new Event( obj.type, obj );
};

let forEachEventObj = function( self, handler, events ){
  if( is.event( events ) ){
    handler( self, events );

    return;
  } else if( is.plainObject( events ) ){
    handler( self, makeEventObj( self, events ) );

    return;
  }

  let eventList = is.array(events) ? events : events.split(/\s+/);

  for( let i = 0; i < eventList.length; i++ ){
    let evt = eventList[i];

    if( is.emptyString( evt ) ){ continue; }

    let match = evt.match( eventRegex ); // type[.namespace]

    if( match ){
      let type = match[1];
      let namespace = match[2] ? match[2] : null;
      let eventObj = makeEventObj( self, {
        type: type,
        namespace: namespace,
        target: self.context
      } );

      handler( self, eventObj );
    }
  }
};

p.on = p.addListener = function( events, qualifier, callback, conf, confOverrides ){
  forEachEvent( this, function( self, event, type, namespace, qualifier, callback, conf ){
    if( is.fn( callback ) ){
      let listeners = self.listeners;
      if( listeners === null ){
        listeners = self.listeners = [];
      }
      listeners.push( {
        event: event, // full event string
        callback: callback, // callback to run
        type: type, // the event type (e.g. 'click')
        namespace: namespace, // the event namespace (e.g. ".foo")
        qualifier: qualifier, // a restriction on whether to match this emitter
        conf: conf // additional configuration
      } );
    }
  }, events, qualifier, callback, conf, confOverrides );

  return this;
};

p.one = function( events, qualifier, callback, conf ){
  return this.on( events, qualifier, callback, conf, { one: true } );
};

p.removeListener = p.off = function( events, qualifier, callback, conf ){
  if( this.listeners === null ){ return this; } // no listeners to remove

  if( this.emitting !== 0 ){
    this.listeners = util.copyArray( this.listeners );
  }

  let listeners = this.listeners;

  for( let i = listeners.length - 1; i >= 0; i-- ){
    let listener = listeners[i];

    forEachEvent( this, function( self, event, type, namespace, qualifier, callback/*, conf*/ ){
      if(
        ( listener.type === type || events === '*' ) &&
        ( (!namespace && listener.namespace !== '.*') || listener.namespace === namespace ) &&
        ( !qualifier || (self._opts.qualifierCompare || defaults.qualifierCompare)( listener.qualifier, qualifier ) ) &&
        ( !callback || listener.callback === callback )
      ){
        listeners.splice( i, 1 );

        return false;
      }
    }, events, qualifier, callback, conf );
  }

  return this;
};

p.removeAllListeners = function(){
  return this.removeListener('*');
};

p.emit = p.trigger = function( events, extraParams, manualCallback ){
  let listeners = this.listeners;
  let numListenersBeforeEmit = listeners !== null ? listeners.length : 0;

  this.emitting++;

  if( !is.array( extraParams ) ){
    extraParams = [ extraParams ];
  }

  forEachEventObj( this, function( self, eventObj ){
    if( manualCallback != null ){
      listeners = [{
        event: eventObj.event,
        type: eventObj.type,
        namespace: eventObj.namespace,
        callback: manualCallback
      }];

      numListenersBeforeEmit = listeners.length;
    }

    for( let i = 0; i < numListenersBeforeEmit; i++ ){
      let listener = listeners[i];

      if(
        ( listener.type === eventObj.type ) &&
        ( !listener.namespace || listener.namespace === eventObj.namespace || listener.namespace === universalNamespace ) &&
        ( (self._opts.eventMatches || defaults.eventMatches)( self.context, listener, eventObj ) )
      ){
        let args = [ eventObj ];

        if( extraParams != null ){
          util.push( args, extraParams );
        }

        (self._opts.beforeEmit || defaults.beforeEmit)( self.context, listener, eventObj );

        if( listener.conf && listener.conf.one ){
          self.listeners = self.listeners.filter( l => l !== listener );
        }

        let context = (self._opts.callbackContext || defaults.callbackContext)( self.context, listener, eventObj );
        let ret = listener.callback.apply( context, args );

        (self._opts.afterEmit || defaults.afterEmit)( self.context, listener, eventObj );

        if( ret === false ){
          eventObj.stopPropagation();
          eventObj.preventDefault();
        }
      } // if listener matches
    } // for listener

    if( (self._opts.bubble || defaults.bubble)( self.context ) && !eventObj.isPropagationStopped() ){
      (self._opts.parent || defaults.parent)( self.context ).emit( eventObj, extraParams );
    }
  }, events );

  this.emitting--;

  return this;
};

export default Emitter;
