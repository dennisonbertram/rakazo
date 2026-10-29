import Foundation
import Testing

@testable import RakazoAPI

private func decode<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
  try JSONDecoder().decode(RPCEnvelope<T>.self, from: loadFixture(named: name)).json
}

@Test
func decodesComputerStatusWhileTheAgentDrives() throws {
  let s = try decode(ComputerStatus.self, "computer-status-running-bot")
  #expect(s.state == .running)
  #expect(s.mode == .team)
  #expect(s.controlHolder == .bot)
  #expect(s.busyBotName == "Finance agent")
  #expect(s.userHasControl(of: "bot-placeholder") == false)
}

@Test
func decodesComputerStatusWhileTheUserDrives() throws {
  let s = try decode(ComputerStatus.self, "computer-status-user-control")
  #expect(s.userHasControl(of: "bot-placeholder"))
  #expect(s.userHasControl(of: "other") == false)
}

@Test
func computerStatusToleratesUnknownValuesAndMissingFields() throws {
  let json = #"{"json":{"botId":"b","state":"hibernating","controlHolder":"robot"}}"#
  let s = try JSONDecoder().decode(RPCEnvelope<ComputerStatus>.self, from: Data(json.utf8)).json
  #expect(s.state == .unknown("hibernating"))
  #expect(s.controlHolder == .unknown("robot"))
  #expect(s.screenWidth == nil)
}

@Test
func decodesScreenTakeoverAndAck() throws {
  #expect(try decode(ComputerScreenResponse.self, "computer-screen-url").url?.hasPrefix("fake://") == true)
  #expect(try decode(ComputerTakeover.self, "computer-takeover").leaseId == "lease-placeholder")
  #expect(try decode(ComputerAck.self, "computer-ack").ok)
  let none = #"{"json":{"url":null}}"#
  #expect(try JSONDecoder().decode(RPCEnvelope<ComputerScreenResponse>.self, from: Data(none.utf8)).json.url == nil)
}

@Test
func encodesReleaseInput() throws {
  let data = try JSONEncoder().encode(ComputerReleaseInput(botId: "b", reason: .skipped))
  #expect(String(decoding: data, as: UTF8.self).contains(#""reason":"skipped""#))
}
