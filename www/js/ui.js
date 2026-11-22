/* UI — the few DOM helpers everything else uses. Deliberately small.
 *
 * `setText` warns rather than silently doing nothing when an element is missing. The
 * sister app taught that lesson the hard way: a stale cached script wrote to element
 * ids that no longer existed, every write quietly no-opped, and the screen showed
 * nothing at all with no error anywhere.
 */
var UI = (function () {
  'use strict';

  var missing = {};

  function $(id) { return document.getElementById(id); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, kids) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function setText(id, text) {
    var node = (typeof id === 'string') ? $(id) : id;
    if (!node) {
      if (!missing[id]) { missing[id] = true; console.warn('UI.setText: no element "' + id + '"'); }
      return false;
    }
    node.textContent = (text === null || text === undefined) ? '' : String(text);
    return true;
  }

  function clear(node) {
    if (typeof node === 'string') node = $(node);
    while (node && node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function show(node, visible) {
    if (typeof node === 'string') node = $(node);
    if (node) node.hidden = !visible;
  }

  function on(node, event, fn) {
    if (typeof node === 'string') node = $(node);
    if (node) node.addEventListener(event, fn);
    return node;
  }

  function toggleClass(node, name, want) {
    if (typeof node === 'string') node = $(node);
    if (node) node.classList.toggle(name, !!want);
  }

  /* A line chart small enough to sit in a card: one series, one colour, no axes.
     Sequential data gets one hue, never a rainbow of per-point colours. */
  function sparkline(values, opts) {
    var o = opts || {};
    var w = o.width || 160, h = o.height || 40, pad = 3;
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('class', 'spark');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', o.label || 'progress');

    if (!values || values.length < 2) return svg;

    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    var span = (max - min) || 1;
    var x = function (i) { return pad + (i / (values.length - 1)) * (w - pad * 2); };
    var y = function (v) { return h - pad - ((v - min) / span) * (h - pad * 2); };

    var d = values.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
    var line = document.createElementNS(svgNS, 'path');
    line.setAttribute('d', d);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', o.colour || '#4cc9a0');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-linejoin', 'round');
    line.setAttribute('stroke-linecap', 'round');
    svg.appendChild(line);

    var dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('cx', x(values.length - 1));
    dot.setAttribute('cy', y(values[values.length - 1]));
    dot.setAttribute('r', '3');
    dot.setAttribute('fill', o.colour || '#4cc9a0');
    svg.appendChild(dot);

    return svg;
  }

  /* A brief message that does not require a tap to dismiss, for things that are worth
     saying once and not worth interrupting for. */
  var toastTimer = null;
  function toast(message) {
    var node = $('toast');
    if (!node) return;
    node.textContent = message;
    node.hidden = false;
    node.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.classList.remove('on');
      setTimeout(function () { node.hidden = true; }, 300);
    }, 2600);
  }

  return {
    $: $, $$: $$, el: el, setText: setText, clear: clear, show: show,
    on: on, toggleClass: toggleClass, sparkline: sparkline, toast: toast
  };
})();
