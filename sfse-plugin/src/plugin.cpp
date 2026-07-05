#include <WinSock2.h>
#include <Windows.h>

#include <atomic>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdarg>
#include <cstring>
#include <string>
#include <thread>

#include "sfse/GameEvents.h"
#include "sfse/PluginAPI.h"
#include "sfse_common/sfse_version.h"

#pragma comment(lib, "ws2_32.lib")

namespace
{
	constexpr char kPluginName[] = "Starfield Chroma Codex";
	constexpr char kBuildTag[] = "1.0.0-rc1";
	constexpr unsigned short kCompanionPort = 47321;
	constexpr bool kDebugRawEvents = false;

	PluginHandle g_pluginHandle = kPluginHandle_Invalid;
	const SFSEMessagingInterface* g_messaging = nullptr;
	std::atomic_bool g_running{ false };
	std::atomic_bool g_gameplayHooksRegistered{ false };
	std::thread g_worker;
	SOCKET g_socket = INVALID_SOCKET;
	sockaddr_in g_target{};
	std::atomic_uint32_t g_actorDamageRawCount{ 0 };
	std::atomic_uint32_t g_actorValueRawCount{ 0 };

	void Log(const char* format, ...)
	{
		FILE* file = nullptr;
		if (fopen_s(&file, "Data\\SFSE\\Plugins\\StarfieldChromaCodex.log", "a") != 0 || !file)
			return;

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
		if (g_socket == INVALID_SOCKET)
			return;

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
		char payload[256];
		std::snprintf(payload, sizeof(payload),
			"{\"type\":\"%s\",\"source\":\"sfse\",\"plugin\":\"StarfieldChromaCodex\",\"build\":\"%s\"}",
			type,
			kBuildTag);
		SendPayload(payload);
	}

	void SendEventJson(const char* type, const char* extraJson)
	{
		char payload[2048];
		std::snprintf(payload, sizeof(payload),
			"{\"type\":\"%s\",\"source\":\"sfse\",\"plugin\":\"StarfieldChromaCodex\",\"build\":\"%s\",%s}",
			type,
			kBuildTag,
			extraJson);
		SendPayload(payload);
	}

	template <typename T>
	T ReadAt(const void* event, std::size_t offset)
	{
		T value{};
		std::memcpy(&value, static_cast<const std::uint8_t*>(event) + offset, sizeof(T));
		return value;
	}

	std::string HexDump(const void* data, std::size_t size)
	{
		static constexpr char kHex[] = "0123456789ABCDEF";
		std::string out;
		out.resize(size * 2);
		const auto* bytes = static_cast<const std::uint8_t*>(data);
		for (std::size_t i = 0; i < size; ++i)
		{
			out[i * 2] = kHex[bytes[i] >> 4];
			out[i * 2 + 1] = kHex[bytes[i] & 0x0F];
		}
		return out;
	}

	template <typename EventT>
	void SendRawEventOnce(const char* type, const EventT& event, std::atomic_uint32_t& counter)
	{
		if constexpr (!kDebugRawEvents)
			return;

		const auto index = counter.fetch_add(1);
		if (index >= 40)
			return;

		const auto hex = HexDump(&event, 96);
		char extra[1700];
		std::snprintf(extra, sizeof(extra),
			"\"sample\":%u,\"bytes\":96,\"hex\":\"%s\","
			"\"u32_00\":%u,\"u32_04\":%u,\"u32_08\":%u,\"u32_0C\":%u,"
			"\"u64_00\":%llu,\"u64_08\":%llu,\"u64_10\":%llu,\"u64_18\":%llu,"
			"\"f32_00\":%.3f,\"f32_04\":%.3f,\"f32_08\":%.3f,\"f32_0C\":%.3f,"
			"\"f32_10\":%.3f,\"f32_14\":%.3f,\"f32_18\":%.3f,\"f32_1C\":%.3f",
			index,
			hex.c_str(),
			ReadAt<std::uint32_t>(&event, 0x00),
			ReadAt<std::uint32_t>(&event, 0x04),
			ReadAt<std::uint32_t>(&event, 0x08),
			ReadAt<std::uint32_t>(&event, 0x0C),
			static_cast<unsigned long long>(ReadAt<std::uint64_t>(&event, 0x00)),
			static_cast<unsigned long long>(ReadAt<std::uint64_t>(&event, 0x08)),
			static_cast<unsigned long long>(ReadAt<std::uint64_t>(&event, 0x10)),
			static_cast<unsigned long long>(ReadAt<std::uint64_t>(&event, 0x18)),
			ReadAt<float>(&event, 0x00),
			ReadAt<float>(&event, 0x04),
			ReadAt<float>(&event, 0x08),
			ReadAt<float>(&event, 0x0C),
			ReadAt<float>(&event, 0x10),
			ReadAt<float>(&event, 0x14),
			ReadAt<float>(&event, 0x18),
			ReadAt<float>(&event, 0x1C));
		SendEventJson(type, extra);
		Log("%s sample=%u hex=%s", type, index, hex.c_str());
	}

	void SendHitDetails(const TESHitEvent& event)
	{
		char extra[768];
		std::snprintf(extra, sizeof(extra),
			"\"sourceFormID\":%u,\"projectileFormID\":%u,\"usesHitData\":%s,"
			"\"aggressorHandle\":%u,\"targetHandle\":%u,\"sourceRefHandle\":%u,"
			"\"damageLimb\":%u,\"hasCriticalEffect\":%s,\"hasHitEffect\":%s,\"hasAmmo\":%s",
			ReadAt<std::uint32_t>(&event, 0x108),
			ReadAt<std::uint32_t>(&event, 0x10C),
			ReadAt<bool>(&event, 0x110) ? "true" : "false",
			ReadAt<std::uint32_t>(&event, 0x40),
			ReadAt<std::uint32_t>(&event, 0x44),
			ReadAt<std::uint32_t>(&event, 0x48),
			ReadAt<std::uint32_t>(&event, 0xE4),
			ReadAt<std::uintptr_t>(&event, 0x68) ? "true" : "false",
			ReadAt<std::uintptr_t>(&event, 0x70) ? "true" : "false",
			ReadAt<std::uintptr_t>(&event, 0x80) ? "true" : "false");
		SendEventJson("game.hit.details", extra);
	}

	void SendActorDamageValue(const ActorDamage::Event& event)
	{
		float value = ReadAt<float>(&event, 0x10);
		if (value < 0)
			value = -value;
		const bool plausible = value >= 0.0f && value < 10000.0f;

		char extra[512];
		std::snprintf(extra, sizeof(extra),
			"\"damage\":%.3f,\"plausible\":%s,\"sourcePtr\":%llu,\"targetPtr\":%llu,\"formOrId\":%u",
			plausible ? value : 0.0f,
			plausible ? "true" : "false",
			static_cast<unsigned long long>(ReadAt<std::uint64_t>(&event, 0x00)),
			static_cast<unsigned long long>(ReadAt<std::uint64_t>(&event, 0x08)),
			ReadAt<std::uint32_t>(&event, 0x14));
		SendEventJson("game.actorDamage.value", extra);
	}

	struct GameplayEventSink :
		public BSTEventSink<ActorDamage::Event>,
		public BSTEventSink<TESHitEvent>,
		public BSTEventSink<CriticalHitEvent::Event>,
		public BSTEventSink<ActorValueEvents::ActorValueChangedEvent>,
		public BSTEventSink<PlayerLifeStateChanged::Event>,
		public BSTEventSink<TESEnterBleedoutEvent>,
		public BSTEventSink<TESExitBleedoutEvent>,
		public BSTEventSink<TESCombatEvent>,
		public BSTEventSink<PlayerAmmoChanged::Event>,
		public BSTEventSink<WeaponFiredEvent>,
		public BSTEventSink<ReloadWeaponEvent::Event>,
		public BSTEventSink<BGSOnPlayerFireWeaponEvent>,
		public BSTEventSink<BGSRadiationDamageEvent>,
		public BSTEventSink<TESContainerChangedEvent>
	{
		EventResult ProcessEvent(const ActorDamage::Event& event, BSTEventSource<ActorDamage::Event>*) override
		{
			SendEvent("game.actorDamage");
			SendActorDamageValue(event);
			SendRawEventOnce("game.actorDamage.raw", event, g_actorDamageRawCount);
			return EventResult::kContinue;
		}

		EventResult ProcessEvent(const TESHitEvent& event, BSTEventSource<TESHitEvent>*) override
		{
			SendEvent("game.hit");
			SendHitDetails(event);
			return EventResult::kContinue;
		}

		EventResult ProcessEvent(const CriticalHitEvent::Event&, BSTEventSource<CriticalHitEvent::Event>*) override
		{
			SendEvent("game.criticalHit");
			return EventResult::kContinue;
		}

		EventResult ProcessEvent(const ActorValueEvents::ActorValueChangedEvent& event, BSTEventSource<ActorValueEvents::ActorValueChangedEvent>*) override
		{
			SendEvent("game.actorValueChanged");
			SendRawEventOnce("game.actorValueChanged.raw", event, g_actorValueRawCount);
			return EventResult::kContinue;
		}

		EventResult ProcessEvent(const PlayerLifeStateChanged::Event&, BSTEventSource<PlayerLifeStateChanged::Event>*) override
		{
			SendEvent("player.lifeStateChanged");
			return EventResult::kContinue;
		}

		EventResult ProcessEvent(const TESEnterBleedoutEvent&, BSTEventSource<TESEnterBleedoutEvent>*) override
		{
			SendEvent("player.bleedout.enter");
			return EventResult::kContinue;
		}

		EventResult ProcessEvent(const TESExitBleedoutEvent&, BSTEventSource<TESExitBleedoutEvent>*) override
		{
			SendEvent("player.bleedout.exit");
			return EventResult::kContinue;
		}

		EventResult ProcessEvent(const TESCombatEvent&, BSTEventSource<TESCombatEvent>*) override
		{
			SendEvent("player.combat");
			return EventResult::kContinue;
		}

		EventResult ProcessEvent(const PlayerAmmoChanged::Event&, BSTEventSource<PlayerAmmoChanged::Event>*) override
		{
			SendEvent("weapon.ammoChanged");
			return EventResult::kContinue;
		}

		EventResult ProcessEvent(const WeaponFiredEvent&, BSTEventSource<WeaponFiredEvent>*) override
		{
			SendEvent("weapon.fired");
			return EventResult::kContinue;
		}

		EventResult ProcessEvent(const ReloadWeaponEvent::Event&, BSTEventSource<ReloadWeaponEvent::Event>*) override
		{
			SendEvent("weapon.reload");
			return EventResult::kContinue;
		}

		EventResult ProcessEvent(const BGSOnPlayerFireWeaponEvent&, BSTEventSource<BGSOnPlayerFireWeaponEvent>*) override
		{
			SendEvent("player.weaponFired");
			return EventResult::kContinue;
		}

		EventResult ProcessEvent(const BGSRadiationDamageEvent&, BSTEventSource<BGSRadiationDamageEvent>*) override
		{
			SendEvent("player.radiationDamage");
			return EventResult::kContinue;
		}

		EventResult ProcessEvent(const TESContainerChangedEvent& event, BSTEventSource<TESContainerChangedEvent>*) override
		{
			char extra[256];
			std::snprintf(extra, sizeof(extra),
				"\"sourceContainerFormID\":%u,\"targetContainerFormID\":%u,\"itemFormID\":%u,\"count\":%u",
				event.sourceContainerFormID,
				event.targetContainerFormID,
				event.itemFormID,
				event.count);
			SendEventJson("inventory.containerChanged", extra);
			return EventResult::kContinue;
		}
	};

	GameplayEventSink g_gameplaySink;

	template <typename EventT>
	bool RegisterGameplaySink(const char* name)
	{
		if (auto* source = GetEventSource<EventT>())
		{
			source->RegisterSink(static_cast<BSTEventSink<EventT>*>(&g_gameplaySink));
			Log("registered sink: %s source=%p", name, source);
			return true;
		}

		Log("missing sink source: %s", name);
		return false;
	}

	void RegisterGameplaySinks()
	{
		if (g_gameplayHooksRegistered.load())
			return;

		bool ok = true;
		ok &= RegisterGameplaySink<ActorDamage::Event>("ActorDamage");
		ok &= RegisterGameplaySink<TESHitEvent>("TESHitEvent");
		ok &= RegisterGameplaySink<CriticalHitEvent::Event>("CriticalHitEvent");
		Log("skipped sink: ActorValueChangedEvent source is unsafe on runtime 1.16.244.0");
		ok &= RegisterGameplaySink<PlayerLifeStateChanged::Event>("PlayerLifeStateChanged");
		ok &= RegisterGameplaySink<TESEnterBleedoutEvent>("TESEnterBleedout");
		ok &= RegisterGameplaySink<TESExitBleedoutEvent>("TESExitBleedout");
		ok &= RegisterGameplaySink<TESCombatEvent>("TESCombat");
		ok &= RegisterGameplaySink<PlayerAmmoChanged::Event>("PlayerAmmoChanged");
		ok &= RegisterGameplaySink<WeaponFiredEvent>("WeaponFired");
		ok &= RegisterGameplaySink<ReloadWeaponEvent::Event>("ReloadWeapon");
		ok &= RegisterGameplaySink<BGSOnPlayerFireWeaponEvent>("BGSOnPlayerFireWeapon");
		ok &= RegisterGameplaySink<BGSRadiationDamageEvent>("BGSRadiationDamage");
		Log("skipped sink: LevelIncrease source is unsafe on runtime 1.16.244.0");
		ok &= RegisterGameplaySink<TESContainerChangedEvent>("TESContainerChanged");

		if (!ok)
		{
			Log("gameplay sink registration incomplete; will retry");
			return;
		}

		g_gameplayHooksRegistered.store(true);
		Log("gameplay hooks registered build=%s", kBuildTag);
		SendEvent("sfse.gameplayHooksRegistered");
	}

	bool PressedNow(int virtualKey)
	{
		return (GetAsyncKeyState(virtualKey) & 0x8000) != 0;
	}

	void SendOnRisingEdge(int virtualKey, bool& previous, const char* eventType)
	{
		const bool current = PressedNow(virtualKey);
		if (current && !previous)
			SendEvent(eventType);
		previous = current;
	}

	void Worker()
	{
		bool previousTab = false;
		bool previousMap = false;
		bool previousInventory = false;
		bool previousScanner = false;
		bool previousInteract = false;
		bool previousReload = false;
		bool previousJump = false;
		bool previousSprint = false;
		bool previousAttack = false;
		bool previousAim = false;
		bool previousUtility[6] = {};
		bool previousQuickslots[10] = {};
		auto lastHeartbeat = std::chrono::steady_clock::now() - std::chrono::seconds(5);

		while (g_running.load())
		{
			const auto now = std::chrono::steady_clock::now();
			if (now - lastHeartbeat >= std::chrono::seconds(5))
			{
				RegisterGameplaySinks();
				SendEvent("sfse.heartbeat");
				lastHeartbeat = now;
			}

			SendOnRisingEdge(VK_TAB, previousTab, "input.menu");
			SendOnRisingEdge('M', previousMap, "input.map");
			SendOnRisingEdge('I', previousInventory, "input.inventory");
			SendOnRisingEdge('F', previousScanner, "input.scanner");
			SendOnRisingEdge('E', previousInteract, "input.interact");
			SendOnRisingEdge('R', previousReload, "input.reload");
			SendOnRisingEdge(VK_SPACE, previousJump, "input.jump");
			SendOnRisingEdge(VK_SHIFT, previousSprint, "input.sprint");
			SendOnRisingEdge(VK_LBUTTON, previousAttack, "input.attack");
			SendOnRisingEdge(VK_RBUTTON, previousAim, "input.aim");

			const int utilityKeys[] = { 'Q', 'Z', 'X', 'C', 'V', 'G' };
			for (int i = 0; i < 6; ++i)
				SendOnRisingEdge(utilityKeys[i], previousUtility[i], "input.utility");

			for (int key = '0'; key <= '9'; ++key)
			{
				int index = key == '0' ? 9 : key - '1';
				SendOnRisingEdge(key, previousQuickslots[index], "input.quickslot");
			}

			std::this_thread::sleep_for(std::chrono::milliseconds(45));
		}
	}

	void MessagingCallback(SFSEMessagingInterface::Message* msg)
	{
		if (!msg)
			return;

		switch (msg->type)
		{
		case SFSEMessagingInterface::kMessage_PostLoad:
			SendEvent("sfse.postLoad");
			break;
		case SFSEMessagingInterface::kMessage_PostDataLoad:
			RegisterGameplaySinks();
			SendEvent("sfse.postDataLoad");
			break;
		case SFSEMessagingInterface::kMessage_PostPostDataLoad:
			SendEvent("sfse.postPostDataLoad");
			break;
		case SFSEMessagingInterface::kMessage_PreSaveGame:
			SendEvent("game.preSave");
			break;
		case SFSEMessagingInterface::kMessage_PostSaveGame:
			SendEvent("game.postSave");
			break;
		case SFSEMessagingInterface::kMessage_PreLoadGame:
			SendEvent("game.preLoad");
			break;
		case SFSEMessagingInterface::kMessage_PostLoadGame:
			SendEvent("game.postLoad");
			break;
		default:
			break;
		}
	}

	void Shutdown()
	{
		g_running.store(false);
		if (g_worker.joinable())
			g_worker.join();
		if (g_socket != INVALID_SOCKET)
		{
			closesocket(g_socket);
			g_socket = INVALID_SOCKET;
		}
		WSACleanup();
	}
}

extern "C"
{
	__declspec(dllexport) SFSEPluginVersionData SFSEPlugin_Version =
	{
		SFSEPluginVersionData::kVersion,
		1,
		"Starfield Chroma Codex",
		"Codex",
		0,
		SFSEPluginVersionData::kStructureIndependence_NoStructs,
		{ RUNTIME_VERSION_1_16_244, 0 },
		0,
		0,
		0
	};

	__declspec(dllexport) bool SFSEPlugin_Load(const SFSEInterface* sfse)
	{
		if (!sfse)
			return false;

		Log("SFSEPlugin_Load build=%s", kBuildTag);
		g_pluginHandle = sfse->GetPluginHandle();
		g_messaging = static_cast<const SFSEMessagingInterface*>(
			sfse->QueryInterface(kInterface_Messaging));

		WSADATA wsa{};
		if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0)
			return false;

		g_socket = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
		if (g_socket == INVALID_SOCKET)
		{
			WSACleanup();
			return false;
		}

		g_target.sin_family = AF_INET;
		g_target.sin_port = htons(kCompanionPort);
		g_target.sin_addr.s_addr = htonl(INADDR_LOOPBACK);

		if (g_messaging)
			g_messaging->RegisterListener(g_pluginHandle, "SFSE", MessagingCallback);

		g_running.store(true);
		g_worker = std::thread(Worker);
		atexit(Shutdown);

		SendEvent("sfse.loaded");
		return true;
	}
}
