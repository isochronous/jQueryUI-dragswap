/**
 * @module widgets/jquery.ui.dragswap
 * @version 0.3.0
 */
define([
    'jquery',
    'jqueryui/draggable',
    'jqueryui/droppable',
    'jqueryui/position',
    'jquery.simulate'
], function ($) {

    'use strict';

    // Various events that this module fires
    /**
     * Event reporting that a drag operation has started
     * @event module:widgets/jquery.ui.dragswap#dragswapstart
     */

    /**
     * Event reporting that a drag operation has stopped
     * @event module:widgets/jquery.ui.dragswap#dragswapstop
     */

    /**
     * Event reporting that a draggable has reverted to its original position
     * @event module:widgets/jquery.ui.dragswap#dragswapreverted
     */

    /**
     * Event reporting that a draggable has reverted, but not to its original position
     * @event module:widgets/jquery.ui.dragswap#dragswaprevertmove
     */

    /**
     * @class $.triton.dragswap
     * @alias module:widgets/jquery.ui.dragswap
     */
    $.widget('triton.dragswap', 
        
        /** @lends $.triton.dragswap.prototype */
        {

            version: '0.3.0',
    
            options: {
                debug: false,
                debugVerbosity: 3,
                draggableOptions: {
                    handle: '.icon-move',
                    revertDuration: 200,
                    scope: 'dragswap',
                    zIndex: 999
                },
                droppableOptions: {
                    scope: 'dragswap'
                },
                logger: console,
                makeDraggable: 'li div',
                makeDroppable: 'li'
            },
            
            requiredDraggableOptions: {
                helper: 'clone',
                revert: false,
            },
            
            requiredDroppableOptions: {
                              
            },
            
            _create: function () {
                this.nodes = {};
                this.nodes.root = this.element.addClass('triton-dragswap');
            },
    
            _init: function () {
                var n = this.nodes,
                    o = this.options;

                this.nodes.draggables = $();
                this.nodes.droppables = $();
                
                this.swapping = false;
    
                this._log('initializing dragswap widget');
                
                n.draggables = n.root.find(o.makeDraggable).draggable($.extend({}, o.draggableOptions, this.requiredDraggableOptions));
                n.droppables = n.root.find(o.makeDroppable).droppable($.extend({}, o.droppableOptions, this.requiredDroppableOptions));
                
                this._log('made draggables out of %o', n.draggables);
                this._log('made droppables out of %o', n.droppables);
    
                this._off(n.draggables, 'dragstart dragstop');
                this._off(n.droppables, 'dropover dropout drop');
    
                // If we bind events like this instead of just passing `start`, `drop`, `stop`, etc options to 
                // draggable and droppable, then we can let users pass in their own callbacks that will be executed
                // in addition to our methods, rather than instead of our methods.
                this._on(n.droppables, {
                    'dropover': this._dropOverHandler,
                    'dropout': this._dropOutHandler,
                    'drop': this._dropDropHandler
                });

                this._on(n.draggables, {
                    'dragstart': this._dragStartHandler,
                    'dragstop': this._dragStopHandler
                });
 
            },

            /**
             * If we're not currently swapping elements, then it saves the parent droppable from which the draggable
             * is being dragged to an internal property, mostly in case we need to "revert" a draggable back to that
             * position.
             * @param {$.Event} e
             * @param {draggableUiHash} ui
             * @private
             */
            _dragStartHandler: function (e, ui) {
                this._log('start handler executing');
                $(e.target).hide();
                if (!this.swapping) {
                    this.firstDraggedElementParent = $(e.target).closest('.ui-droppable'); // should be a droppable
                }
            },
    
            /**
             * Because we have the `revert` option set to false, no draggables will ever revert to their original
             * position when dropped.  This means we have to do the revert animation and logic ourselves, but there
             * are two cases - when an element is being reverted back to where it came from (which means there have
             * been no swaps performed) and when an element is being reverted back to an "empty" cell that wasn't
             * its original location
             * @param {$.Event} e
             * @param {draggableUiHash} ui
             * @protected
             */
            _dragStopHandler: function (e, ui) {
                var $draggable = $(e.target),
                    instance, that = this;
                
                this._log('stop handler executing');
                
                // If draggable is the lastValidDropped element, then we know the dragstop ended in a valid drop, so
                // there's no need to revert.
                if (this.lastValidDropped && $draggable.is(this.lastValidDropped)) {
                    delete this.lastValidDropped;
                } else {
                    // Get the instance so we can set internal properties
                    instance = $draggable.data('ui-draggable');
                    // call revert method
                    this._log('calling doRevert method');
                    $.when(this._doRevert(e, instance)).then(function () {
                        that._log('revert complete, calling _clear on draggable');
                        instance._clear();
                    });
                    return false;
                }
            },

            /**
             * Handles `dropover` events - adds the `is-drop-target` class to the droppable under the draggable, and
             * adds either the `is-swap` or `is-drop` class to the draggable based on whether or not there's already
             * a draggable in the droppable. Also saves the current droppable to the widget as the `mostRecentDropTarget`
             * property, which is checked against in the `_dropOutHandler` method.
             * @param {$.Event} e
             * @param {droppableUiHash} ui
             * @protected
             */
            _dropOverHandler: function (e, ui) {
                var $droppable = $(e.target).addClass('is-drop-target');
                var dragInstance = ui.draggable.data('ui-draggable');
                var helper = dragInstance.helper || ui.draggable;

                this._log('over handler executing');

                if ($droppable.find('.ui-draggable').not(ui.draggable).not(dragInstance.helper).length) {
                    helper.removeClass('is-drop').addClass('is-swap');
                } else {
                    helper.removeClass('is-swap').addClass('is-drop');
                }
                this.mostRecentDropTarget = $droppable;
            },

            /**
             * Handles `dropout` events - need to remove the `is-drop` or `is-swap` class from the draggable, but only
             * if this event is being triggered from the most recent droppable that was hovered.  If the draggable can
             * span two different droppables, then removing the class on every `out` without doing this check will remove
             * the style while the draggable is still over a valid (the most recent) drop target. If the triggering
             * droppable IS the most recent drop target, then both `is-drop` and `is-swap` are removed from the draggable
             * and the `mostRecentDropTarget` reference is deleted from the widget.
             * @param {$.Event} e
             * @param {droppableUiHash} ui
             * @protected
             */
            _dropOutHandler: function (e, ui) {
                var $droppable = $(e.target).removeClass('is-drop-target');
                var dragInstance = ui.draggable.data('ui-draggable');
                var helper = dragInstance.helper || ui.draggable;

                this._log('out handler executing');

                if ($droppable.is(this.mostRecentDropTarget)) {
                    helper.removeClass('is-drop is-swap');
                    delete this.mostRecentDropTarget;
                }
            },

            /**
             * Handles drop operations, determines if a swap is necessary, and if so, triggers it
             * @param {$.Event} e
             * @param {droppableUiHash} ui
             * @protected
             */
            _dropDropHandler: function (e, ui) {
                
                var $targ = $(e.target).removeClass('is-drop-target is-swap is-drop'),
                    $draggableEl = ui.draggable,
                    draggableInstance = $draggableEl.data('ui-draggable'),
                    $targetDraggable, $targetHandle;

                this._log('drop handler executing');
                
                $targ = $targ.is('.ui-droppable') ? $targ : $targ.closest('.ui-droppable');
                
                $draggableEl.appendTo($targ)
                    .css({top: 0, left: 0})
                    .show();
                
                $targetDraggable = $targ.find('.ui-draggable').not($draggableEl);
                $targetHandle = $targetDraggable.find(draggableInstance.options.handle);
                
                if ($targetDraggable.length) {
                    this._log('triggering swap event');
                    this._trigger('swap', null, {'new': $draggableEl, 'old': $targetDraggable, 'droppable': $targ});
                    this.swapping = true;
                    $targetHandle.simulate('drag', {});
                    // TODO: pulse a highlight on the swap to emphasize what happened
                } else {
                    this.swapping = false;
                }
                
                this.lastValidDropped = $draggableEl;
            },
    
            /**
             * Reverts the current draggable when an invalid drop is made. Instead of simply returning to the
             * original position, it instead moves the
             * @param {$.Event} event
             * @param {$.ui.draggable} instance
             * @fires module:widgets/jquery.ui.dragswap#dragswapstop
             * @fires module:widgets/jquery.ui.dragswap#dragswapreverted
             * @fires module:widgets/jquery.ui.dragswap#dragswaprevertmove
             * @protected
             */
            _doRevert: function (event, instance) {
                // get the actual element (currently detached)
                var $el = instance.element;
                // find where to revert to
                var $emptyCell = this.firstDraggedElementParent;
                // now get the helper (clone of $el, the thing actually being dragged)
                var $helper = instance.helper;
                // get the revert animation duration
                var aniDuration = parseInt(this.options.draggableOptions.revertDuration, 10);
                var aniPromise = $.Deferred(), def = $.Deferred();
    
                $helper.position({
                    'my':    'top left',
                    'at':    'top left',
                    'of':    $emptyCell,
                    'using': function (css) {
                        aniPromise = $helper.animate(css, aniDuration).promise();
                    }
                });
    
                aniPromise.done(function () {
                    
                    var revertingToOwnOrigin = false;
    
                    // Did the element being reverted come from the empty cell? We need to know because if so, it's
                    // not being moved, but if it didn't come from the empty cell, then it IS being moved, and other
                    // controls may need to be aware of that.  So, if we can find the original element in the "empty"
                    // cell, then it's simply reverting.  If not, it's a revert & move. Obviously we have to do this check
                    // before appending the element to the empty cell, or the check will always be true.
                    if ($emptyCell.find($el).length) {
                        revertingToOwnOrigin = true;
                    }
                    
                    $el.appendTo($emptyCell).show();
                    
                    if (revertingToOwnOrigin) {
                        this._log('triggering reverted event');
                        this._trigger('reverted', event, this._uiHash());
                    } else {
                        this._log('triggering revertmove event');
                        this._trigger('revertmove', event, this._uiHash());
                    }
    
                    def.resolve();
                    
                }.bind(this));
    
                delete this.firstDraggedElementParent;
                
                return def.promise();
            },

            /**
             * Passed along with `_trigger`d events triggered by this widget
             * @returns {{dragswap: jquery, dragswapInstance: module:widgets/jquery.ui.dragswap}}
             * @private
             */
            _uiHash: function () {
                return {
                    dragswap: this.element,
                    dragswapInstance: this,
                }
            },


            /**
             * Easy method for logging messages to the console, can be turned on or off via the `debug` option
             * @param {string} msg
             * @protected
             */
            _log: function (msg) {
                //if (this.options.debugVerbosity < 3) { return; }
                var args = Array.prototype.slice.call(arguments);
                var opts = this.options;
                opts.debug && opts.logger.log.apply(opts.logger, args);
            },

            /**
             * Easy method for logging warnings to the console, can be turned on or off via the `debug` option
             * @param {string} msg
             * @protected
             */
            _warn: function (msg) {
                //if (this.options.debugVerbosity < 2) { return; }
                var args = Array.prototype.slice.call(arguments);
                var opts = this.options;
                opts.debug && opts.logger.warn.apply(opts.logger, args);
            },

            /**
             * Easy method for logging errors to the console, can be turned on or off via the `debug` option
             * @param {string} msg - the desired error message
             * @param {string=} [errType] - The desired error type. Defaults to 'GenericBracketWidgetErr'.
             * @protected
             */
            _error: function (msg, errType) {
                //if (this.options.debugVerbosity < 1) { return; }
                var args = Array.prototype.slice.call(arguments);
                var opts = this.options;
                var err = new Error(msg);
                err.name = errType || 'GenericBracketWidgetErr';
                opts.debug && opts.logger.error.apply(opts.logger, args);
                throw(err);
            },
    
            destroy: function () {
                var n = this.nodes;
                n.root.removeClass('triton-dragswap');
                this._off(n.draggables, 'dragstart dragstop');
                this._off(n.droppables, 'dropover dropout drop');
                n.draggables.draggable('destroy');
                n.droppables.droppable('destroy');
            }
        }
    );

    return $;
});
