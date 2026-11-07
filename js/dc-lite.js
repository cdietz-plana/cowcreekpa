/* dc-lite: a tiny runtime that renders the prototype's template format with React.
   Templates use {{ path }} holes, <sc-if value>, <sc-for list as>, and a Component class with renderVals(). */
(function () {
  var VOID = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, source: 1, track: 1, wbr: 1 };
  var EVENTS = { onclick: 'onClick', onchange: 'onChange', oninput: 'onInput', onpointerdown: 'onPointerDown', onkeydown: 'onKeyDown', onmousemove: 'onMouseMove', onsubmit: 'onSubmit', onfocus: 'onFocus', onblur: 'onBlur' };
  var ATTR = { class: 'className', for: 'htmlFor', tabindex: 'tabIndex', readonly: 'readOnly', maxlength: 'maxLength', autocomplete: 'autoComplete', inputmode: 'inputMode', 'stroke-width': 'strokeWidth', 'stroke-linecap': 'strokeLinecap', 'stroke-linejoin': 'strokeLinejoin', 'fill-opacity': 'fillOpacity', 'stroke-opacity': 'strokeOpacity', 'clip-path': 'clipPath' };
  var deco = document.createElement('textarea');
  function decode(t) { if (t.indexOf('&') < 0) return t; deco.innerHTML = t; return deco.value; }

  function parse(src) {
    var root = { tag: '#root', attrs: [], children: [] }, stack = [root];
    var re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>|([^<]+)/g, m;
    var attrRe = /([^\s=>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
    while ((m = re.exec(src))) {
      var top = stack[stack.length - 1];
      if (m[0].slice(0, 4) === '<!--') continue;
      if (m[1]) { // close
        for (var i = stack.length - 1; i > 0; i--) { if (stack[i].tag === m[1]) { stack.length = i; break; } }
      } else if (m[2]) {
        var attrs = [], a; attrRe.lastIndex = 0;
        while ((a = attrRe.exec(m[3] || ''))) attrs.push([a[1], a[2] !== undefined ? a[2] : (a[3] !== undefined ? a[3] : true)]);
        var node = { tag: m[2], attrs: attrs, children: [] };
        top.children.push(node);
        if (!m[4] && !VOID[m[2].toLowerCase()]) stack.push(node);
      } else if (m[5] !== undefined) {
        if (/^\s+$/.test(m[5]) && m[5].indexOf('\n') >= 0) continue;
        top.children.push({ text: m[5] });
      }
    }
    return root;
  }

  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g, ONLY = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
  function look(path, scope) {
    path = path.trim();
    if (path === 'true') return true; if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return parseFloat(path);
    if (/^'.*'$|^".*"$/.test(path)) return path.slice(1, -1);
    var parts = path.split('.'), v;
    for (var i = scope.length - 1; i >= 0; i--) { if (scope[i] && Object.prototype.hasOwnProperty.call(scope[i], parts[0])) { v = scope[i][parts[0]]; break; } }
    for (var k = 1; k < parts.length && v != null; k++) v = v[parts[k]];
    return v;
  }
  function interp(str, scope) { return str.replace(HOLE, function (_, p) { var v = look(p, scope); return v == null ? '' : String(v); }); }
  function val(raw, scope) { if (raw === true) return true; var o = ONLY.exec(raw); if (o) return look(o[1], scope); return decode(interp(raw, scope)); }
  function styleObj(str) {
    var out = {};
    str.split(';').forEach(function (decl) {
      var i = decl.indexOf(':'); if (i < 0) return;
      var k = decl.slice(0, i).trim(), v = decl.slice(i + 1).trim(); if (!k) return;
      if (k.indexOf('--') !== 0) k = k.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
      out[k] = v;
    });
    return out;
  }

  var h = function () { return React.createElement.apply(React, arguments); };
  function render(node, scope, key) {
    if (node.text !== undefined) {
      var t = node.text;
      if (t.indexOf('{{') < 0) return decode(t);
      var o = ONLY.exec(t); if (o) { var v = look(o[1], scope); if (v == null || v === false || typeof v === 'object') return null; }
      return decode(interp(t, scope));
    }
    var tag = node.tag, A = {};
    node.attrs.forEach(function (p) { A[p[0]] = p[1]; });
    if (tag === 'helmet') return null;
    if (tag === 'sc-if') return val(A.value, scope) ? h(React.Fragment, { key: key }, kids(node, scope)) : null;
    if (tag === 'sc-for') {
      var list = val(A.list, scope) || [], as = A.as || 'item';
      return h(React.Fragment, { key: key }, list.map(function (it, i) { var sc = {}; sc[as] = it; sc.$index = i; return h(React.Fragment, { key: i }, kids(node, scope.concat([sc]))); }));
    }
    var props = { key: key };
    node.attrs.forEach(function (p) {
      var name = p[0], raw = p[1], low = name.toLowerCase();
      if (low.indexOf('hint-') === 0) return;
      var v = val(raw, scope);
      if (EVENTS[low]) { if (typeof v === 'function') props[EVENTS[low]] = v; return; }
      if (low === 'style') { props.style = styleObj(typeof v === 'string' ? v : ''); return; }
      if (low === 'ref') { if (typeof v === 'function') props.ref = v; return; }
      if (low === 'href' && typeof v === 'string' && window.DC_LINKS) { var mapped = v.replace(/^\.?\/?/, ''); if (DC_LINKS[mapped] !== undefined) v = DC_LINKS[mapped]; }
      if (low === 'value' && (tag === 'input' || tag === 'textarea')) { props.value = v == null ? '' : v; if (!props.onChange) props.onChange = function () {}; return; }
      if (low === 'disabled' || low === 'checked' || low === 'selected') { props[low] = !!v && v !== 'false'; return; }
      props[ATTR[low] || name] = v === true ? '' : v;
    });
    if ((tag === 'input' || tag === 'textarea') && props.value !== undefined) {
      var oc = props.onChange; props.onChange = oc || function () {};
    }
    if (tag === 'a' && props['data-exit']) {
      var href = props.href; props.onClick = function (e) { if (!href || href === '#') return; e.preventDefault(); document.body.classList.add('leaving'); setTimeout(function () { location.href = href; }, 650); };
    }
    if (tag === 'textarea') return h('textarea', props);
    return VOID[tag.toLowerCase()] ? h(tag, props) : h(tag, props, kids(node, scope));
  }
  function kids(node, scope) { return node.children.map(function (c, i) { return render(c, scope, i); }); }

  var tree = null;
  window.DCLogic = class extends React.Component {
    render() { return h(React.Fragment, null, kids(tree, [this.renderVals() || {}])); }
  };
  window.DC = {
    mount: function (Comp) {
      var src = document.getElementById('dc-template').textContent;
      tree = parse(src);
      ReactDOM.createRoot(document.getElementById('app')).render(h(Comp, {}));
    }
  };
})();
