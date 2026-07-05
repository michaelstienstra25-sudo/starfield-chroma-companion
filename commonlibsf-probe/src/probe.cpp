#include <SFSE/SFSE.h>
#include <RE/Starfield.h>

#include <WinSock2.h>
#include <Windows.h>

#include <atomic>
#include <chrono>
#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <thread>

#pragma comment(lib, "ws2_32.lib")

namespace
{
	constexpr unsigned short kCompanionPort = 47321;
	constexpr char kBuildTag[] = "commonlibsf-probe-0.1.0";

	SOCKET g_socket = INVALID_SOCKET;
	sockaddr_in g_target{};
	std::atomic_bool g_udpReady{ false };
	std::atomic_bool g_registered{ false };
	std::thread g_registerThread;

	void Log(const char* format, ...)
	{
		FILE* file = nullptr;
		if (fopen_s(&file, "Data\\SFSE\\Plugins\\StarfieldChromaProbe.log", "a") != 0 || !file) {
			return;
		}

		SYSTEMTIME time{};
		GetLocalTime(&time);
		std::fprintf(file, "%04u-%02u-%02u %02u:%02u:%02u.%03u ",
			time.wYear, time.wMonth, time.wDay,
			time.wHour, time.wMinute, time.wSecond, time.wMilliseconds);

		va_list args;
		va_start(args, format);
		std::vfprintf(file, format, args);
		va_end(args);

		std::fprintf(file, "\n");
		std::fclose(file);
	}

	void SendPayload(const char* payload)
	{
		if (!g_udpReady.load() || g_socket == INVALID_SOCKET) {
			return;
		}

		sendto(
			g_socket,
			payload,
			static_cast<int>(std::strlen(payload)),
			0,
			reinterpret_cast<const sockaddr*>(&g_target),
			sizeof(g_target));
	}

	void SendEvent(const char* type)
	{
		char payload[512];
		std::snprintf(payload, sizeof(payload),
			"{\"type\":\"%s\",\"source\":\"commonlibsf-probe\",\"plugin\":\"StarfieldChromaProbe\",\"build\":\"%s\"}",
			type,
			kBuildTag);
		SendPayload(payload);
		Log("%s", type);
	}

	void SendEventJson(const char* type, const char* extraJson)
	{
		char payload[1024];
		std::snprintf(payload, sizeof(payload),
			"{\"type\":\"%s\",\"source\":\"commonlibsf-probe\",\"plugin\":\"StarfieldChromaProbe\",\"build\":\"%s\",%s}",
			type,
			kBuildTag,
			extraJson);
		SendPayload(payload);
		Log("%s %s", type, extraJson);
	}

	bool InitUdp()
	{
		WSADATA data{};
		if (WSAStartup(MAKEWORD(2, 2), &data) != 0) {
			Log("WSAStartup failed");
			return false;
		}

		g_socket = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
		if (g_socket == INVALID_SOCKET) {
			Log("socket failed");
			return false;
		}

		g_target.sin_family = AF_INET;
		g_target.sin_port = htons(kCompanionPort);
		g_target.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
		g_udpReady.store(true);
		return true;
	}

	struct ProbeSink :
		RE::BSTEventSink<RE::MenuOpenCloseEvent>,
		RE::BSTEventSink<RE::LevelUp_OnWidgetShown>,
		RE::BSTEventSink<RE::LevelUp_AnimFinished>,
		RE::BSTEventSink<RE::ExperienceMeterDisplayData>,
		RE::BSTEventSink<RE::HUDNotificationEvent>,
		RE::BSTEventSink<RE::HUDNotification_SetMissionActive>,
		RE::BSTEventSink<RE::HUDNotification_MissionActiveWidgetUpdate>,
		RE::BSTEventSink<RE::HUDModeEvent>,
		RE::BSTEventSink<RE::PlayerCrimeGoldEvent>,
		RE::BSTEventSink<RE::PlayerControls::PlayerIronSightsStartEvent>,
		RE::BSTEventSink<RE::PlayerControls::PlayerIronSightsEndEvent>,
		RE::BSTEventSink<RE::PlayerControls::PlayerJumpPressEvent>,
		RE::BSTEventSink<RE::PlayerControls::PlayerJumpReleaseEvent>,
		RE::BSTEventSink<RE::PlayerControls::PlayerZeroGSprintJustPressedEvent>,
		RE::BSTEventSink<RE::PlayerControls::PlayerZeroGSprintReleasedEvent>
	{
		RE::BSEventNotifyControl ProcessEvent(const RE::MenuOpenCloseEvent& event, RE::BSTEventSource<RE::MenuOpenCloseEvent>*) override
		{
			char extra[512];
			std::snprintf(extra, sizeof(extra),
				"\"menu\":\"%s\",\"opening\":%s",
				event.menuName.c_str(),
				event.opening ? "true" : "false");
			SendEventJson(event.opening ? "ui.menu.open" : "ui.menu.close", extra);
			return RE::BSEventNotifyControl::kContinue;
		}

		RE::BSEventNotifyControl ProcessEvent(const RE::LevelUp_OnWidgetShown&, RE::BSTEventSource<RE::LevelUp_OnWidgetShown>*) override
		{
			SendEvent("level.widgetShown");
			return RE::BSEventNotifyControl::kContinue;
		}

		RE::BSEventNotifyControl ProcessEvent(const RE::LevelUp_AnimFinished&, RE::BSTEventSource<RE::LevelUp_AnimFinished>*) override
		{
			SendEvent("level.animFinished");
			return RE::BSEventNotifyControl::kContinue;
		}

		RE::BSEventNotifyControl ProcessEvent(const RE::ExperienceMeterDisplayData&, RE::BSTEventSource<RE::ExperienceMeterDisplayData>*) override
		{
			SendEvent("player.experienceMeter");
			return RE::BSEventNotifyControl::kContinue;
		}

		RE::BSEventNotifyControl ProcessEvent(const RE::HUDNotificationEvent&, RE::BSTEventSource<RE::HUDNotificationEvent>*) override
		{
			SendEvent("hud.notification");
			return RE::BSEventNotifyControl::kContinue;
		}

		RE::BSEventNotifyControl ProcessEvent(const RE::HUDNotification_SetMissionActive&, RE::BSTEventSource<RE::HUDNotification_SetMissionActive>*) override
		{
			SendEvent("mission.active");
			return RE::BSEventNotifyControl::kContinue;
		}

		RE::BSEventNotifyControl ProcessEvent(const RE::HUDNotification_MissionActiveWidgetUpdate&, RE::BSTEventSource<RE::HUDNotification_MissionActiveWidgetUpdate>*) override
		{
			SendEvent("mission.widgetUpdate");
			return RE::BSEventNotifyControl::kContinue;
		}

		RE::BSEventNotifyControl ProcessEvent(const RE::HUDModeEvent&, RE::BSTEventSource<RE::HUDModeEvent>*) override
		{
			SendEvent("hud.mode");
			return RE::BSEventNotifyControl::kContinue;
		}

		RE::BSEventNotifyControl ProcessEvent(const RE::PlayerCrimeGoldEvent& event, RE::BSTEventSource<RE::PlayerCrimeGoldEvent>*) override
		{
			char extra[128];
			std::snprintf(extra, sizeof(extra), "\"crimeType\":%u", static_cast<unsigned>(event.type));
			SendEventJson("player.crime", extra);
			return RE::BSEventNotifyControl::kContinue;
		}

		RE::BSEventNotifyControl ProcessEvent(const RE::PlayerControls::PlayerIronSightsStartEvent&, RE::BSTEventSource<RE::PlayerControls::PlayerIronSightsStartEvent>*) override
		{
			SendEvent("player.aim.start");
			return RE::BSEventNotifyControl::kContinue;
		}

		RE::BSEventNotifyControl ProcessEvent(const RE::PlayerControls::PlayerIronSightsEndEvent&, RE::BSTEventSource<RE::PlayerControls::PlayerIronSightsEndEvent>*) override
		{
			SendEvent("player.aim.end");
			return RE::BSEventNotifyControl::kContinue;
		}

		RE::BSEventNotifyControl ProcessEvent(const RE::PlayerControls::PlayerJumpPressEvent&, RE::BSTEventSource<RE::PlayerControls::PlayerJumpPressEvent>*) override
		{
			SendEvent("player.jump.press");
			return RE::BSEventNotifyControl::kContinue;
		}

		RE::BSEventNotifyControl ProcessEvent(const RE::PlayerControls::PlayerJumpReleaseEvent&, RE::BSTEventSource<RE::PlayerControls::PlayerJumpReleaseEvent>*) override
		{
			SendEvent("player.jump.release");
			return RE::BSEventNotifyControl::kContinue;
		}

		RE::BSEventNotifyControl ProcessEvent(const RE::PlayerControls::PlayerZeroGSprintJustPressedEvent&, RE::BSTEventSource<RE::PlayerControls::PlayerZeroGSprintJustPressedEvent>*) override
		{
			SendEvent("player.zerogSprint.press");
			return RE::BSEventNotifyControl::kContinue;
		}

		RE::BSEventNotifyControl ProcessEvent(const RE::PlayerControls::PlayerZeroGSprintReleasedEvent&, RE::BSTEventSource<RE::PlayerControls::PlayerZeroGSprintReleasedEvent>*) override
		{
			SendEvent("player.zerogSprint.release");
			return RE::BSEventNotifyControl::kContinue;
		}
	};

	ProbeSink g_sink;

	template <class Event>
	void TryRegister(const char* name)
	{
		Log("registering: %s", name);
		auto* source = Event::GetEventSource();
		if (!source) {
			Log("source unavailable: %s", name);
			return;
		}
		source->RegisterSink(&g_sink);
		Log("registered: %s", name);
	}

	void RegisterHooks()
	{
		if (g_registered.exchange(true)) {
			return;
		}

		Log("registration thread waiting for UI singleton");
		for (int attempt = 0; attempt < 120; ++attempt) {
			auto* ui = RE::UI::GetSingleton();
			if (ui) {
				Log("registering: UI MenuOpenCloseEvent");
				ui->RegisterSink<RE::MenuOpenCloseEvent>(&g_sink);
				Log("registered: UI MenuOpenCloseEvent");
				SendEvent("probe.ready");
				return;
			}
			std::this_thread::sleep_for(std::chrono::seconds(1));
		}

		Log("UI singleton unavailable after wait");
		SendEvent("probe.ready");
	}

	void OnMessage(SFSE::MessagingInterface::Message* message)
	{
		if (!message) {
			return;
		}

		if (message->type == SFSE::MessagingInterface::kPostDataLoad) {
			Log("PostDataLoad");
			if (!g_registerThread.joinable()) {
				g_registerThread = std::thread([] {
					std::this_thread::sleep_for(std::chrono::seconds(10));
					RegisterHooks();
				});
				g_registerThread.detach();
			}
		}
	}
}

SFSE_PLUGIN_LOAD(const SFSE::LoadInterface* sfse)
{
	SFSE::Init(sfse);
	Log("%s loading", kBuildTag);
	InitUdp();

	const auto* messaging = SFSE::GetMessagingInterface();
	if (!messaging) {
		Log("messaging interface unavailable");
		return false;
	}

	messaging->RegisterListener(OnMessage);
	SendEvent("probe.loaded");
	return true;
}
