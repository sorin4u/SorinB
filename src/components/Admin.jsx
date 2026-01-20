import { useCallback, useEffect, useMemo, useState } from 'react'

function fmtDate(value) {
	if (!value) return ''
	const d = new Date(value)
	if (Number.isNaN(d.getTime())) return String(value)
	return d.toLocaleString()
}

export default function Admin({ apiBase, authToken }) {
	const [users, setUsers] = useState([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(null)

	const [editingId, setEditingId] = useState(null)
	const [editEmail, setEditEmail] = useState('')
	const [editRole, setEditRole] = useState('user')
	const [editPassword, setEditPassword] = useState('')
	const [saving, setSaving] = useState(false)
	const [deletingId, setDeletingId] = useState(null)

	const authHeaders = useMemo(() => {
		return authToken ? { Authorization: `Bearer ${authToken}` } : {}
	}, [authToken])

	const fetchUsers = useCallback((options = {}) => {
		const { showLoading = true, clearError = true } = options

		if (showLoading) setLoading(true)
		if (clearError) setError(null)
		fetch(`${apiBase}/api/admin/users`, {
			credentials: 'include',
			headers: {
				...authHeaders,
			},
		})
			.then(async (r) => {
				if (r.status === 401 || r.status === 403) {
					throw new Error('Not authorized (admin only).')
				}
				if (!r.ok) {
					const text = await r.text().catch(() => '')
					throw new Error(`HTTP ${r.status} ${r.statusText} ${text}`)
				}
				return r.json()
			})
			.then((data) => {
				setUsers(Array.isArray(data?.data) ? data.data : [])
				setLoading(false)
			})
			.catch((e) => {
				setError(e.message)
				setLoading(false)
			})
	}, [apiBase, authHeaders])

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		fetchUsers()
	}, [fetchUsers])

	const startEdit = useCallback((u) => {
		setEditingId(u.id)
		setEditEmail(String(u.email || ''))
		setEditRole(String(u.role || 'user'))
		setEditPassword('')
	}, [])

	const cancelEdit = useCallback(() => {
		setEditingId(null)
		setEditEmail('')
		setEditRole('user')
		setEditPassword('')
	}, [])

	const saveEdit = useCallback(() => {
		if (editingId == null) return
		setSaving(true)
		setError(null)

		const body = {
			email: editEmail,
			role: editRole,
		}
		if (editPassword && editPassword.length > 0) body.password = editPassword

		fetch(`${apiBase}/api/admin/users/${editingId}`, {
			method: 'PUT',
			credentials: 'include',
			headers: {
				'Content-Type': 'application/json',
				...authHeaders,
			},
			body: JSON.stringify(body),
		})
			.then(async (r) => {
				const data = await r.json().catch(() => null)
				if (!r.ok) throw new Error(data?.error || `Update failed: HTTP ${r.status}`)
				return data
			})
			.then((data) => {
				const updated = data?.user
				if (updated) {
					setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
				}
				setSaving(false)
				cancelEdit()
			})
			.catch((e) => {
				setError(e.message)
				setSaving(false)
			})
	}, [apiBase, authHeaders, cancelEdit, editEmail, editPassword, editRole, editingId])

	const deleteUser = useCallback(
		(u) => {
			const ok = window.confirm(`Delete user ${u.email}? This cannot be undone.`)
			if (!ok) return

			setDeletingId(u.id)
			setError(null)

			fetch(`${apiBase}/api/admin/users/${u.id}`, {
				method: 'DELETE',
				credentials: 'include',
				headers: {
					...authHeaders,
				},
			})
				.then(async (r) => {
					const data = await r.json().catch(() => null)
					if (!r.ok) throw new Error(data?.error || `Delete failed: HTTP ${r.status}`)
					return data
				})
				.then(() => {
					setUsers((prev) => prev.filter((x) => x.id !== u.id))
					setDeletingId(null)
					if (editingId === u.id) cancelEdit()
				})
				.catch((e) => {
					setError(e.message)
					setDeletingId(null)
				})
		},
		[apiBase, authHeaders, cancelEdit, editingId],
	)

	return (
		<>
			<div className="sectionHeader">
				<h2>Users (admin)</h2>
				<div className="actions">
					<button className="btn" type="button" onClick={fetchUsers} disabled={loading}>
						{loading ? 'Refreshing…' : 'Refresh'}
					</button>
				</div>
			</div>

			{error && <p className="status error">Error: {error}</p>}
			{loading && <p className="status">Loading users…</p>}

			<div className="tableWrap" role="region" aria-label="Users table" tabIndex={0}>
				<table className="dataTable">
					<thead>
						<tr>
							<th scope="col">id</th>
							<th scope="col">email</th>
							<th scope="col">role</th>
							<th scope="col">created_at</th>
							<th scope="col">actions</th>
						</tr>
					</thead>
					<tbody>
						{users.map((u) => {
							const isEditing = editingId === u.id
							return (
								<tr key={u.id}>
									<td>{u.id}</td>
									<td>
										{isEditing ? (
											<input
												className="adminInput"
												value={editEmail}
												onChange={(e) => setEditEmail(e.target.value)}
												type="email"
												autoComplete="off"
											/>
										) : (
											u.email
										)}
									</td>
									<td>
										{isEditing ? (
											<select className="adminSelect" value={editRole} onChange={(e) => setEditRole(e.target.value)}>
												<option value="user">user</option>
												<option value="admin">admin</option>
											</select>
										) : (
											u.role
										)}
									</td>
									<td>{fmtDate(u.created_at)}</td>
									<td>
										<div className="adminActions">
											{isEditing ? (
												<>
													<input
														className="adminInput"
														value={editPassword}
														onChange={(e) => setEditPassword(e.target.value)}
														type="password"
														placeholder="New password (optional)"
														autoComplete="new-password"
													/>
													<button className="btn" type="button" onClick={saveEdit} disabled={saving}>
														{saving ? 'Saving…' : 'Save'}
													</button>
													<button className="btn" type="button" onClick={cancelEdit} disabled={saving}>
														Cancel
													</button>
												</>
											) : (
												<>
													<button className="btn" type="button" onClick={() => startEdit(u)}>
														Update
													</button>
													<button
														className="btn"
														type="button"
														onClick={() => deleteUser(u)}
														disabled={deletingId === u.id}
													>
														{deletingId === u.id ? 'Deleting…' : 'Delete'}
													</button>
												</>
											)}
										</div>
									</td>
								</tr>
							)
						})}
						{users.length === 0 && !loading && (
							<tr>
								<td colSpan={5} className="muted">
									No users found.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</>
	)
}
