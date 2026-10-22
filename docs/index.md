---
layout: home

hero:
  name: imvu.js
  text: TypeScript for IMVU
  tagline: A modern, typed client for the IMVU API, its realtime IMQ service, and the product files IMVU is built from.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: API reference
      link: /api/
    - theme: alt
      text: GitHub
      link: https://github.com/dhkatz/imvu.js

features:
  - title: '@imvu/client'
    details: The high-level API — log in, search users, wishlists, gifting, messaging — with canonical resources and explicit realtime watches.
    link: /packages/client/
  - title: '@imvu/rest'
    details: The low-level REST client — cookie-based auth, session reuse, and raw typed API envelopes on the standard fetch.
    link: /packages/rest/
  - title: '@imvu/imq'
    details: IMVU's IMQ websocket service — connect, subscribe to queues and mounts, and observe chat and notification events.
    link: /packages/imq/
  - title: '@imvu/xmlrpc'
    details: The legacy XML-RPC gateway the classic client uses — including resolving a product's current CFL and its ancestors.
    link: /packages/xmlrpc/
  - title: '@imvu/chkn'
    details: Load products end to end — CFL and CHKN archives, index.xml templates with inheritance, assets, and flattened exports.
    link: /packages/chkn/
  - title: '@imvu/cal3d'
    details: Read and write the Cal3D files products are made of — skeletons, meshes, materials and animations, binary or XML.
    link: /packages/cal3d/
---
