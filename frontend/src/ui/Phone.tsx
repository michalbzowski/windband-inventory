import type { ReactNode } from 'react';

/** The phone-frame used by every full-screen view (mockup §.phone + §.sbar). */
export default function Phone({ children }: { children: ReactNode }) {
  return (
    <div className="phone">
      <div className="sbar">
        <span>9:41</span>
        <span className="r">
          <span className="sig">▂▄▆█</span> 5G <i className="bat" /> 84%
        </span>
      </div>
      {children}
      <div className="homebar">
        <i />
      </div>
    </div>
  );
}
