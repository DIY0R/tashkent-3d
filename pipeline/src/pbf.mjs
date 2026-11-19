// Minimal streaming OSM PBF reader (no dependencies). Reads one blob at a time,
// so memory use stays at a few tens of MB regardless of file size.
import fs from 'node:fs';
import zlib from 'node:zlib';

class Reader {
  constructor(buf, pos = 0, end = buf.length) {
    this.b = buf;
    this.p = pos;
    this.e = end;
  }
  varint() {
    const b = this.b;
    let c = b[this.p++];
    if (c < 128) return c;
    let r = c & 127;
    c = b[this.p++];
    r |= (c & 127) << 7;
    if (c < 128) return r;
    c = b[this.p++];
    r |= (c & 127) << 14;
    if (c < 128) return r;
    c = b[this.p++];
    r |= (c & 127) << 21;
    if (c < 128) return r;
    let m = 268435456; // 2^28
    for (;;) {
      c = b[this.p++];
      r += (c & 127) * m;
      if (c < 128) break;
      m *= 128;
    }
    return r;
  }
  // zigzag-decoded signed varint (safe below 2^53)
  svarint() {
    const n = this.varint();
    return n % 2 ? -(n + 1) / 2 : n / 2;
  }
  skip(wire) {
    if (wire === 0) this.varint();
    else if (wire === 2) {
      const l = this.varint();
      this.p += l;
    }
    else if (wire === 1) this.p += 8;
    else if (wire === 5) this.p += 4;
    else throw new Error('bad wire type ' + wire);
  }
  sub() {
    const len = this.varint();
    const r = new Reader(this.b, this.p, this.p + len);
    this.p += len;
    return r;
  }
}

/** Yields decompressed blobs: { type: 'OSMHeader'|'OSMData', data: Buffer } */
export async function* readBlobs(file) {
  const fd = await fs.promises.open(file, 'r');
  try {
    let pos = 0;
    const size = (await fd.stat()).size;
    const lenBuf = Buffer.alloc(4);
    while (pos < size) {
      await fd.read(lenBuf, 0, 4, pos);
      pos += 4;
      const hlen = lenBuf.readUInt32BE(0);
      const hbuf = Buffer.alloc(hlen);
      await fd.read(hbuf, 0, hlen, pos);
      pos += hlen;
      const hr = new Reader(hbuf);
      let type = '';
      let datasize = 0;
      while (hr.p < hr.e) {
        const tag = hr.varint();
        const f = tag >>> 3;
        if (f === 1) {
          const l = hr.varint();
          type = hbuf.toString('utf8', hr.p, hr.p + l);
          hr.p += l;
        } else if (f === 3) datasize = hr.varint();
        else hr.skip(tag & 7);
      }
      const bbuf = Buffer.alloc(datasize);
      await fd.read(bbuf, 0, datasize, pos);
      pos += datasize;
      const br = new Reader(bbuf);
      let data = null;
      while (br.p < br.e) {
        const tag = br.varint();
        const f = tag >>> 3;
        if (f === 1) {
          const l = br.varint();
          data = bbuf.subarray(br.p, br.p + l);
          br.p += l;
        } else if (f === 3) {
          const l = br.varint();
          data = zlib.inflateSync(bbuf.subarray(br.p, br.p + l));
          br.p += l;
        } else br.skip(tag & 7);
      }
      if (!data) throw new Error('unsupported blob compression');
      yield { type, data };
    }
  } finally {
    await fd.close();
  }
}

/**
 * Parses one OSMData blob and calls handlers.
 * handlers.node(id, lat1e7, lon1e7, tagsFn)  tagsFn() -> object|null (lazy)
 * handlers.way(id, tagsFn, refs:number[])
 * handlers.relation(id, tagsFn, membersFn)   membersFn() -> [{type:0|1|2, ref, role}]
 * Any handler may be omitted; the matching primitives are then skipped cheaply.
 */
export function parseBlock(buf, handlers) {
  const r = new Reader(buf);
  const strRaw = [];
  const groups = [];
  let gran = 100;
  let latOff = 0;
  let lonOff = 0;
  while (r.p < r.e) {
    const tag = r.varint();
    const f = tag >>> 3;
    if (f === 1) {
      const st = r.sub();
      while (st.p < st.e) {
        const t = st.varint();
        if (t >>> 3 === 1) {
          const l = st.varint();
          strRaw.push([st.p, l]);
          st.p += l;
        } else st.skip(t & 7);
      }
    } else if (f === 2) groups.push(r.sub());
    else if (f === 17) gran = r.varint();
    else if (f === 19) latOff = r.varint();
    else if (f === 20) lonOff = r.varint();
    else r.skip(tag & 7);
  }
  const strCache = new Array(strRaw.length);
  const str = (i) => {
    let s = strCache[i];
    if (s === undefined) {
      const [p, l] = strRaw[i];
      s = strCache[i] = buf.toString('utf8', p, p + l);
    }
    return s;
  };
  const scale = gran / 100; // -> 1e-7 degrees
  const packed = (rd) => {
    const out = [];
    while (rd.p < rd.e) out.push(rd.varint());
    return out;
  };

  for (const g of groups) {
    while (g.p < g.e) {
      const tag = g.varint();
      const f = tag >>> 3;
      if (f === 2 && handlers.node) {
        const d = g.sub();
        let ids = null;
        let lats = null;
        let lons = null;
        let kv = null;
        while (d.p < d.e) {
          const t = d.varint();
          const ff = t >>> 3;
          if (ff === 1) ids = d.sub();
          else if (ff === 8) lats = d.sub();
          else if (ff === 9) lons = d.sub();
          else if (ff === 10) kv = d.sub();
          else d.skip(t & 7);
        }
        if (!ids) continue;
        let id = 0;
        let lat = 0;
        let lon = 0;
        const hasKv = kv && kv.p < kv.e;
        while (ids.p < ids.e) {
          id += ids.svarint();
          lat += lats.svarint();
          lon += lons.svarint();
          let tagStart = -1;
          if (hasKv) {
            tagStart = kv.p;
            // advance to the 0 terminator
            while (kv.p < kv.e && kv.varint() !== 0) kv.varint();
          }
          const ts = tagStart;
          const te = hasKv ? kv.p : -1;
          handlers.node(id, latOff / 100 + lat * scale, lonOff / 100 + lon * scale, () => {
            if (ts < 0) return null;
            const rr = new Reader(kv.b, ts, te);
            let tags = null;
            for (;;) {
              if (rr.p >= rr.e) break;
              const k = rr.varint();
              if (k === 0) break;
              const v = rr.varint();
              (tags ??= {})[str(k)] = str(v);
            }
            return tags;
          });
        }
      } else if ((f === 3 && handlers.way) || (f === 4 && handlers.relation)) {
        const w = g.sub();
        let id = 0;
        let keys = null;
        let vals = null;
        let refs = null;
        let roles = null;
        let types = null;
        while (w.p < w.e) {
          const t = w.varint();
          const ff = t >>> 3;
          if (ff === 1) id = w.varint();
          else if (ff === 2) keys = w.sub();
          else if (ff === 3) vals = w.sub();
          else if (ff === 8) {
            if (f === 3) refs = w.sub();
            else roles = w.sub();
          } else if (ff === 9 && f === 4) refs = w.sub();
          else if (ff === 10 && f === 4) types = w.sub();
          else w.skip(t & 7);
        }
        const tagsFn = () => {
          if (!keys) return {};
          const ks = packed(new Reader(keys.b, keys.p, keys.e));
          const vs = packed(new Reader(vals.b, vals.p, vals.e));
          const tags = {};
          for (let i = 0; i < ks.length; i++) tags[str(ks[i])] = str(vs[i]);
          return tags;
        };
        const refsFn = () => {
          const out = [];
          if (!refs) return out;
          const rr = new Reader(refs.b, refs.p, refs.e);
          let v = 0;
          while (rr.p < rr.e) {
            v += rr.svarint();
            out.push(v);
          }
          return out;
        };
        if (f === 3) handlers.way(id, tagsFn, refsFn);
        else
          handlers.relation(id, tagsFn, () => {
            const ids = refsFn();
            const rs = roles ? packed(new Reader(roles.b, roles.p, roles.e)) : [];
            const ts = types ? packed(new Reader(types.b, types.p, types.e)) : [];
            return ids.map((ref, i) => ({ type: ts[i], ref, role: str(rs[i]) }));
          });
      } else g.skip(tag & 7);
    }
  }
}
