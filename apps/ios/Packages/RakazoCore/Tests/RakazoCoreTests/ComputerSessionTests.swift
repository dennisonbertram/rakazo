import Foundation
import RakazoAPI
import Synchronization
import Testing

@testable import RakazoCore

/// Sleepers wait until the test advances time.
private final class StepClock: ComputerClock {
  private struct State {
    var now = 1_710_000_000_000
    var sleepers: [Int: CheckedContinuation<Void, Error>] = [:]
    var nextID = 0
    var durations: [Duration] = []
  }
  private let state = Mutex(State())

  func nowMs() -> Int { state.withLock { $0.now } }

  func sleep(_ duration: Duration) async throws {
    let id = state.withLock { s -> Int in
      s.nextID += 1
      s.durations.append(duration)
      return s.nextID
    }
    try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
        let cancelled = state.withLock { s -> Bool in
          if Task.isCancelled { return true }
          s.sleepers[id] = c
          return false
        }
        if cancelled { c.resume(throwing: CancellationError()) }
      }
    } onCancel: {
      let c = state.withLock { $0.sleepers.removeValue(forKey: id) }
      c?.resume(throwing: CancellationError())
    }
  }

  var sleeperCount: Int { state.withLock { $0.sleepers.count } }
  var durations: [Duration] { state.withLock { $0.durations } }

  /// Moves time forward and wakes every sleeper once.
  func advance(ms: Int) async {
    let woken = state.withLock { s -> [CheckedContinuation<Void, Error>] in
      s.now += ms
      let all = Array(s.sleepers.values)
      s.sleepers = [:]
      return all
    }
    woken.forEach { $0.resume() }
  }
}

@MainActor
private final class Harness {
  let clock = StepClock()
  var status = ComputerStatus(botId: "b")
  var url: String? = "https://app.example/novnc/session/view/1710003600000.tok/embed.html"
  var statusReads = 0
  var screenReads = 0
  var pings = 0
  var statuses: [ComputerStatus] = []
  var screens: [String?] = []
  lazy var session = ComputerSession(
    hooks: .init(
      readStatus: { [unowned self] in statusReads += 1; return status },
      readScreen: { [unowned self] _ in screenReads += 1; return url },
      heartbeat: { [unowned self] in pings += 1 },
      onStatus: { [unowned self] in statuses.append($0) },
      onScreen: { [unowned self] in screens.append($0) }),
    clock: clock)

  /// Lets queued tasks run until `condition` holds.
  func settle(_ condition: () -> Bool) async {
    for _ in 0..<200 where !condition() { await Task.yield() }
  }

  /// Waits for a poll or heartbeat task to be sleeping, then advances time.
  func tick(ms: Int, sleepers: Int = 1) async {
    await settle { clock.sleeperCount >= sleepers }
    await clock.advance(ms: ms)
  }
}

@MainActor @Test func startReadsStatusAndScreenOnce() async throws {
  let h = Harness()
  try await h.session.start()
  #expect(h.statusReads == 1 && h.screenReads == 1)
  #expect(h.screens == [h.url])
  h.session.stop()
}

@MainActor @Test func pollsStatusEveryTwoSecondsWithoutRereadingTheScreen() async throws {
  let h = Harness()
  try await h.session.start()
  await h.tick(ms: 2000)
  await h.settle { h.statusReads == 2 }
  await h.tick(ms: 2000)
  await h.settle { h.statusReads == 3 }
  #expect(h.statusReads == 3)
  #expect(h.screenReads == 1)
  #expect(h.clock.durations.allSatisfy { $0 == .seconds(2) })
  h.session.stop()
}

@MainActor @Test func rereadsTheScreenWhenTheStatusThatShapesItChanges() async throws {
  let h = Harness()
  try await h.session.start()
  h.status = ComputerStatus(botId: "b", controlHolder: .user, controlBotId: "b")
  await h.tick(ms: 2000)
  await h.settle { h.screenReads == 2 }
  #expect(h.screenReads == 2)
  h.session.stop()
}

@MainActor @Test func renewsTheScreenAtFiftyMinutesWithoutAStatusChange() async throws {
  let h = Harness()
  h.url = "https://sandbox.example/stream?authKey=one&view_only=true"
  try await h.session.start()
  await h.tick(ms: 49 * 60_000)
  await h.settle { h.statusReads == 2 }
  #expect(h.screenReads == 1)
  await h.tick(ms: 60_000)
  await h.settle { h.screenReads == 2 }
  #expect(h.screenReads == 2)
  h.session.stop()
}

@MainActor @Test func aReusedSealRenewsFromItsOwnIssueTime() async throws {
  let h = Harness()
  // Issued at the clock's start (expiry minus one hour), so renewal is due 50 minutes later.
  try await h.session.start()
  await h.tick(ms: 51 * 60_000)
  await h.settle { h.screenReads == 2 }
  #expect(h.screenReads == 2)
  h.session.stop()
}

@MainActor @Test func aFailedScreenReadKeepsTheLastUrlAndNullClearsIt() async throws {
  let h = Harness()
  try await h.session.start()
  h.session.invalidateScreen()
  h.url = nil
  await h.tick(ms: 2000)
  await h.settle { h.screens.count == 2 }
  #expect(h.screens.last == .some(nil))
  h.session.stop()
}

@MainActor @Test func heartbeatPingsAtOnceThenEverySixtySecondsWhileControlling() async throws {
  let h = Harness()
  try await h.session.start()
  #expect(h.pings == 0)
  h.session.setControlling(true)
  await h.settle { h.pings == 1 }
  await h.tick(ms: 60_000, sleepers: 2)
  await h.settle { h.pings == 2 }
  await h.tick(ms: 60_000, sleepers: 2)
  await h.settle { h.pings == 3 }
  #expect(h.pings == 3)
  #expect(h.clock.durations.contains(.seconds(60)))
  h.session.setControlling(false)
  let before = h.pings
  await h.clock.advance(ms: 60_000)
  for _ in 0..<20 { await Task.yield() }
  #expect(h.pings == before)
  h.session.stop()
}

@MainActor @Test func stopEndsPollingAndHeartbeats() async throws {
  let h = Harness()
  try await h.session.start()
  h.session.setControlling(true)
  await h.settle { h.pings == 1 }
  h.session.stop()
  await h.clock.advance(ms: 120_000)
  for _ in 0..<50 { await Task.yield() }
  #expect(h.statusReads == 1 && h.pings == 1)
  #expect(!h.session.isActive)
}

@MainActor @Test func performPausesPollingAndRefreshesAfterTheAction() async throws {
  let h = Harness()
  try await h.session.start()
  var ran = false
  let result = try await h.session.perform {
    ran = true
    return 7
  }
  #expect(result == 7 && ran)
  #expect(h.statusReads == 2 && h.screenReads == 2)
  // Polling resumes afterwards.
  await h.tick(ms: 2000)
  await h.settle { h.statusReads == 3 }
  #expect(h.statusReads == 3)
  h.session.stop()
}

@MainActor @Test func performDoesNotRefreshWhenTheActionThrows() async throws {
  struct Denied: Error {}
  let h = Harness()
  try await h.session.start()
  await #expect(throws: Denied.self) {
    _ = try await h.session.perform { throw Denied() }
  }
  #expect(h.statusReads == 1)
  h.session.stop()
}
