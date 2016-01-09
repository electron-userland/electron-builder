// test( 'Builder.init().build - load config if passed as string', function( t ) {
//   t.plan( 3 );
//
//   var Builder = proxyquireStrict(
//     '../',
//     {
//       './lib/platforms' : {
//         bar : {
//           init : function() {
//             return {
//               build : function( options, callback ) {
//                 t.equal( options.basePath, '/some' );
//                 t.equal( options.config.foo, 'bar' );
//               }
//             }
//           }
//         }
//       },
//       '/some/config.json' : {
//         foo : 'bar'
//       }
//     }
//   );
//
//   Builder.init().build(
//     {
//       appPath  : 'foo',
//       platform : 'bar',
//       config   : '/some/config.json'
//     },
//     function( e ) {}
//   );
//
//   Builder.init().build(
//     {
//       appPath  : 'foo',
//       platform : 'bar',
//       config   : '/some/not/existant/config.json'
//     },
//     function( error ) {
//       t.equal(
//         error.message, 'Could not load config file:\nCannot find module \'/some/not/existant/config.json\''
//       );
//     }
//   );
// } );
