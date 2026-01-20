export default function Navbar({ user, onLogout, authMode, onSetAuthMode }) {
  return (
    <header className="navbar" role="banner">
      <div className="navbarInner">
        <div className="navLeft">
          <a className="navBrand" href="Home" aria-label="Go to Home">
            Home
          </a>

          {user ? (
            <nav className="navLinks" aria-label="Primary">
              {/* <a className="navLink" href="#map">
                Map
              </a> */}
              {user.role === 'admin' && (
                <a className="navLink" href="Admin.html">
                  Admin
                </a>
              )}
            </nav>
          ) : null}
        </div>

        <div className="navRight">
          {user ? (
            <>
              <span className="navUser" title={user.email}>
                {user.email} ({user.role})
              </span>
              <button className="btn navBtn" type="button" onClick={onLogout}>
                Logout
              </button>
            </>
          ) : (
            <>
              <button
                className="btn navBtn"
                type="button"
                onClick={() => onSetAuthMode?.('login')}
                disabled={authMode === 'login'}
              >
                Login
              </button>
              <button
                className="btn navBtn"
                type="button"
                onClick={() => onSetAuthMode?.('register')}
                disabled={authMode === 'register'}
              >
                Register
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
