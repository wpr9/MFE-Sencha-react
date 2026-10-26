/*
 * Ext JS class registry for the blotter remote. Evaluated once, after the Ext
 * runtime is ready (see remote/ext-runtime.ts). Import order is dependency
 * order: Ext.define is synchronous and classes reference each other at
 * definition time.
 */
import './util/Format.js';
import './util/Csv.js';
import './data/HostProxy.js';
import './model/Order.js';
import './view/HostViewController.js';
import './view/blotter/BlotterModel.js';
import './view/blotter/BlotterController.js';
import './view/blotter/OrderDetail.js';
import './view/blotter/Blotter.js';
import './view/widget/RecentOrders.js';
