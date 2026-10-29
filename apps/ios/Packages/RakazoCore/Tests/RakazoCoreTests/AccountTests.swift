import Foundation
import Testing

@testable import RakazoCore

private let sessionOK = rpcResponse(#"{"user":{"id":"u1"}}"#)

private func bodyJSON(_ request: HTTPRequest) throws -> [String: Any] {
  let data = try #require(request.body)
  return try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
}

@Test
func changePasswordSendsBothPasswordsAndKeepsTheNewSession() async throws {
  let transport = FakeTransport([sessionOK, rpcResponse(#"{"token":"tok-2","user":{"id":"u1"}}"#)])
  let storage = FakeStorage()
  let client = try await signedInClient(transport, storage: storage)
  try await client.changePassword(current: "old-password", new: "new-password")
  let request = try #require(await transport.requests.last)
  #expect(request.url.path == "/api/auth/change-password")
  #expect(request.headers["authorization"] == "Bearer tok-1")
  let body = try bodyJSON(request)
  #expect(body["currentPassword"] as? String == "old-password")
  #expect(body["newPassword"] as? String == "new-password")
  #expect(body["revokeOtherSessions"] as? Bool == true)
  #expect(storage.session?.token == "tok-2")
  #expect((await client.snapshot()).isSignedIn)
}

@Test
func changePasswordWrongCurrentPasswordKeepsTheSessionAndShowsTheServerMessage() async throws {
  let transport = FakeTransport([
    sessionOK, rpcResponse(#"{"message":"Invalid password"}"#, status: 400),
  ])
  let storage = FakeStorage()
  let client = try await signedInClient(transport, storage: storage)
  await #expect(throws: AccountRequestError(status: 400, message: "Invalid password")) {
    try await client.changePassword(current: "wrong", new: "new-password")
  }
  #expect(storage.session?.token == "tok-1")
  #expect((await client.snapshot()).isSignedIn)
}

@Test
func changePasswordRejectsShortNewPasswordWithoutASend() async throws {
  let transport = FakeTransport([sessionOK])
  let client = try await signedInClient(transport)
  await #expect(throws: AuthClientError.invalidPassword) {
    try await client.changePassword(current: "old-password", new: "short")
  }
  #expect(await transport.requests.count == 1)
}

@Test
func changePasswordWithoutAReplacementTokenEndsTheSession() async throws {
  let transport = FakeTransport([sessionOK, rpcResponse(#"{"status":true}"#)])
  let storage = FakeStorage()
  let client = try await signedInClient(transport, storage: storage)
  await #expect(throws: AuthClientError.missingSession) {
    try await client.changePassword(current: "old-password", new: "new-password")
  }
  #expect(!(await client.snapshot()).isSignedIn)
  #expect(storage.session == nil)
}

@Test
func deleteAccountByPasswordSendsItAndForgetsTheSession() async throws {
  let transport = FakeTransport([sessionOK, rpcResponse(#"{"success":true}"#)])
  let storage = FakeStorage()
  let client = try await signedInClient(transport, storage: storage)
  try await client.deleteAccount(.password("old-password"))
  let request = try #require(await transport.requests.last)
  #expect(request.url.path == "/api/auth/delete-user")
  #expect(try bodyJSON(request) as NSDictionary == ["password": "old-password"])
  #expect(!(await client.snapshot()).isSignedIn)
  #expect(storage.session == nil)
}

@Test
func deleteAccountByEmailedCodeSendsTheToken() async throws {
  let transport = FakeTransport([sessionOK, rpcResponse(#"{"success":true}"#)])
  let client = try await signedInClient(transport)
  try await client.deleteAccount(.emailedCode(" abc123 "))
  let request = try #require(await transport.requests.last)
  #expect(try bodyJSON(request) as NSDictionary == ["token": "abc123"])
}

@Test
func deleteAccountFailureKeepsTheSignedInSession() async throws {
  let transport = FakeTransport([
    sessionOK, rpcResponse(#"{"message":"Invalid password"}"#, status: 400),
  ])
  let storage = FakeStorage()
  let client = try await signedInClient(transport, storage: storage)
  await #expect(throws: AccountRequestError(status: 400, message: "Invalid password")) {
    try await client.deleteAccount(.password("wrong"))
  }
  #expect((await client.snapshot()).isSignedIn)
  #expect(storage.session?.token == "tok-1")
}

@Test
func accountSecurityReadsTheSignInOptions() async throws {
  let transport = FakeTransport([
    sessionOK,
    rpcResponse(
      #"{"freshOidcAuth":false,"ssoLinked":false,"hasPassword":false,"passwordChangeEnabled":true,"emailDeletion":true,"sso":null}"#
    ),
    rpcResponse(#"{"success":true}"#),
  ])
  let client = try await signedInClient(transport)
  let security = try await client.accountSecurity()
  #expect(security == AccountSecurity(hasPassword: false, passwordChangeEnabled: true, emailDeletion: true))
  try await client.requestAccountDeletionCode()
}
