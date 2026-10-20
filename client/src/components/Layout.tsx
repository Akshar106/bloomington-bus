import { Link, NavLink, Outlet } from "react-router";
import styles from "./Layout.module.css";

export function Layout() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.inner}>
          <Link to="/" className={styles.brand}>
            <img src="/favicon.svg" alt="" width={28} height={28} />
            Bloomington Bus
          </Link>
          <nav aria-label="Main" className={styles.nav}>
            <NavLink to="/routes">Routes</NavLink>
            <NavLink to="/about">About</NavLink>
          </nav>
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        Unofficial student project. Not affiliated with Bloomington Transit or Indiana University. Times come from BT's
        public live feed and may be wrong.
      </footer>
    </div>
  );
}
