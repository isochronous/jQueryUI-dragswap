/**
 * Created by jeremy.mcleod on 3/24/2014.
 */
require.config({

    'enforceDefine': true,

    'paths': {

        // jQuery (NOT jQuery UI)
        'jquery':                   'lib/jquery-2.1.0',
        'jquery-noconflict':        'lib/jquery.no-conflict',
        'jquery.simulate':          'lib/jquery.simulate.ext',
        // jQuery UI (i.e. stuff that uses widget factory)
        'jqueryui':                 'lib/jquery-ui'

    },

    waitSeconds: 15,

    map: {
        // 'jquery-noconflict' wants the real jQuery module. If this line was not here, there would
        // be an unresolvable cyclic dependency.
        'jquery-noconflict': {
            'jquery': 'jquery'
        }
    }

});
