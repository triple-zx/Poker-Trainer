// Durable DCFR state for the trainer's exact, deterministic postflop trees.
// This is not a strategy export: regrets, cached sums and accumulated strategy
// must all survive, along with the absolute iteration number.
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <io.h>
#else
#include <sys/stat.h>
#include <unistd.h>
#endif
#include "solver/PCfrSolver.h"
#include <cmath>
#include <cstdlib>
#include <cstdio>
#include <functional>
#include <limits>

namespace {
#ifdef _WIN32
std::wstring widePath(const std::string& path) {
    int size = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, path.c_str(), -1, nullptr, 0);
    if (!size) throw std::runtime_error("Invalid checkpoint path");
    std::wstring result(size, L'\0');
    MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, path.c_str(), -1, result.data(), size);
    result.pop_back();
    return result;
}
#endif
bool exists(const std::string& path) {
#ifdef _WIN32
    return GetFileAttributesW(widePath(path).c_str()) != INVALID_FILE_ATTRIBUTES;
#else
    struct stat info;
    return ::stat(path.c_str(), &info) == 0;
#endif
}
std::string env(const char* name) {
#ifdef _WIN32
    std::wstring key(name, name + std::strlen(name));
    const wchar_t* value = _wgetenv(key.c_str());
    if (!value || !*value) return "";
    int size = WideCharToMultiByte(CP_UTF8, 0, value, -1, nullptr, 0, nullptr, nullptr);
    std::string result(size, '\0');
    WideCharToMultiByte(CP_UTF8, 0, value, -1, result.data(), size, nullptr, nullptr);
    result.pop_back();
    return result;
#else
    const char* value = std::getenv(name);
    return value ? value : "";
#endif
}

// Reads use expected sizes from the rebuilt tree, never allocations requested
// by the file. FNV detects accidental corruption; this is not authentication.
class StateStream {
    FILE* file = nullptr;
    bool reading;
    uint64_t checksum = 14695981039346656037ULL;
public:
    StateStream(const std::string& path, bool load): reading(load) {
#ifdef _WIN32
        file = _wfopen(widePath(path).c_str(), load ? L"rb" : L"wb");
#else
        file = std::fopen(path.c_str(), load ? "rb" : "wb");
#endif
        if (!file) throw std::runtime_error("Cannot open solver checkpoint");
    }
    ~StateStream() { if (file) std::fclose(file); }
    void bytes(void* data, size_t size) {
        size_t count = reading ? std::fread(data, 1, size, file) : std::fwrite(data, 1, size, file);
        if (count != size) throw std::runtime_error("Truncated checkpoint or checkpoint write failed");
        for (size_t i = 0; i < size; ++i) {
            checksum ^= static_cast<unsigned char*>(data)[i];
            checksum *= 1099511628211ULL;
        }
    }
    template<class T> void value(T& value) { bytes(&value, sizeof(value)); }
    template<class T> void expect(T expected) {
        T actual = expected;
        value(actual);
        if (actual != expected) throw std::runtime_error("Checkpoint game or format mismatch");
    }
    void text(const std::string& expected) {
        expect<uint64_t>(expected.size());
        std::string actual = expected;
        bytes(actual.data(), actual.size());
        if (actual != expected) throw std::runtime_error("Checkpoint settings mismatch");
    }
    void floats(std::vector<float>& values, bool nonnegative) {
        expect<uint64_t>(values.size());
        bytes(values.data(), values.size() * sizeof(float));
        for (float v : values)
            if (!std::isfinite(v) || (nonnegative && v < 0))
                throw std::runtime_error("Invalid checkpoint numerical state");
    }
    void finish() {
        uint64_t stored = checksum;
        if (reading) {
            size_t count = std::fread(&stored, 1, sizeof(stored), file);
            if (count != sizeof(stored) || stored != checksum || std::fgetc(file) != EOF || std::ferror(file))
                throw std::runtime_error("Checkpoint checksum or length mismatch");
        } else {
            if (std::fwrite(&stored, 1, sizeof(stored), file) != sizeof(stored) || std::fflush(file))
                throw std::runtime_error("Checkpoint flush failed");
#ifdef _WIN32
            if (_commit(_fileno(file))) throw std::runtime_error("Checkpoint disk flush failed");
#else
            if (::fsync(fileno(file))) throw std::runtime_error("Checkpoint disk flush failed");
#endif
        }
        int status = std::fclose(file);
        file = nullptr;
        if (status) throw std::runtime_error("Checkpoint close failed");
    }
};
}

void PCfrSolver::configureCheckpoint() {
    checkpoint_file = env("POKER_CHECKPOINT_FILE");
    if (checkpoint_file.empty()) return;
    if (use_isomorphism || warmup != -1 || monteCarolAlg != Solver::MonteCarolAlg::NONE || trainer != "discounted_cfr")
        throw std::runtime_error("Checkpoints require exact DCFR without sampling, warmup or suit isomorphism");
    checkpoint_key = env("POKER_CHECKPOINT_KEY");
    if (checkpoint_key.size() != 64 || checkpoint_key.find_first_not_of("0123456789abcdef") != std::string::npos)
        throw std::runtime_error("Checkpoint requires a SHA-256 configuration key");
    checkpoint_pause_file = env("POKER_PAUSE_FILE");
    auto interval = env("POKER_CHECKPOINT_INTERVAL");
    if (!interval.empty()) checkpoint_interval = std::stoi(interval);
    if (checkpoint_interval < 1 || checkpoint_interval > 10000)
        throw std::runtime_error("Invalid checkpoint interval");
    if (env("POKER_RESUME_CHECKPOINT") == "1") {
        checkpointState(true);
        checkpointProgress("running");
    }
}

void PCfrSolver::checkpointProgress(const std::string& status) {
    if (checkpoint_file.empty()) return;
    checkpoint_progress_time = timeSinceEpochMillisec();
    std::cout << "TRAINER_PROGRESS " << json({{"iteration", completed_iterations},
        {"target", iteration_number}, {"saved", saved_iterations}, {"status", status}}).dump() << std::endl;
}

void PCfrSolver::checkpointState(bool load) {
    const auto destination = checkpoint_file;
    const auto temporary = checkpoint_file + ".tmp";
    StateStream stream(load ? destination : temporary, load);
    static_assert(sizeof(float) == 4 && std::numeric_limits<float>::is_iec559, "Checkpoint requires IEEE float32");
    stream.text("PokerTrainer-DCFR-checkpoint-v1");
    stream.expect<uint32_t>(0x01020304); // Reject incompatible byte order.
    stream.text(checkpoint_key);
    json config = {{"board", initial_board}, {"trainer", trainer}, {"warmup", warmup},
        {"accuracy", accuracy}, {"printInterval", print_interval}, {"threads", num_threads}};
    for (auto& range : ranges) {
        json hands = json::array();
        for (auto& hand : range) hands.push_back({hand.card1, hand.card2, hand.weight});
        config["ranges"].push_back(hands);
    }
    for (auto& card : deck.getCards()) config["deck"].push_back(card.getCardInt());
    stream.text(config.dump());
    uint32_t iteration = completed_iterations;
    stream.value(iteration);
    if (iteration > static_cast<uint32_t>(iteration_number))
        throw std::runtime_error("Checkpoint exceeds requested iteration budget");
    uint8_t converged = checkpoint_converged ? 1 : 0;
    stream.value(converged);
    if (converged > 1) throw std::runtime_error("Invalid checkpoint convergence state");
    std::function<void(std::shared_ptr<GameTreeNode>)> visit = [&](std::shared_ptr<GameTreeNode> node) {
        stream.expect<int32_t>(node->getType());
        stream.expect<int32_t>(node->getRound());
        stream.expect<double>(node->getPot());
        switch (node->getType()) {
        case GameTreeNode::ACTION: {
            auto action = std::dynamic_pointer_cast<ActionNode>(node);
            stream.expect<int32_t>(action->getPlayer());
            stream.expect<uint64_t>(action->getActions().size());
            for (auto& item : action->getActions()) stream.text(item.toString());
            stream.expect<uint64_t>(action->trainables.size());
            for (auto& slot : action->trainables) {
                uint8_t present = slot ? 1 : 0;
                stream.value(present);
                if (present > 1) throw std::runtime_error("Invalid checkpoint slot");
                if (load) slot = present ? std::make_shared<DiscountedCfrTrainable>(action->player_privates, *action) : nullptr;
                if (present) {
                    auto state = std::dynamic_pointer_cast<DiscountedCfrTrainable>(slot);
                    if (!state) throw std::runtime_error("Unsupported checkpoint trainer");
                    stream.floats(state->r_plus, false);
                    stream.floats(state->r_plus_sum, true);
                    stream.floats(state->cum_r_plus, true);
                }
            }
            stream.expect<uint64_t>(action->getChildrens().size());
            for (auto& child : action->getChildrens()) visit(child);
            break;
        }
        case GameTreeNode::CHANCE: {
            auto chance = std::dynamic_pointer_cast<ChanceNode>(node);
            stream.expect<uint8_t>(chance->isDonk());
            stream.expect<uint64_t>(chance->getCards().size());
            for (auto card : chance->getCards()) stream.expect<int32_t>(card.getCardInt());
            visit(chance->getChildren());
            break;
        }
        case GameTreeNode::TERMINAL:
            stream.text(json(std::dynamic_pointer_cast<TerminalNode>(node)->get_payoffs()).dump());
            break;
        case GameTreeNode::SHOWDOWN: {
            auto showdown = std::dynamic_pointer_cast<ShowdownNode>(node);
            stream.text(json({showdown->get_payoffs(ShowdownNode::TIE, -1),
                showdown->get_payoffs(ShowdownNode::NOTTIE, 0),
                showdown->get_payoffs(ShowdownNode::NOTTIE, 1)}).dump());
            break;
        }
        }
    };
    visit(tree->getRoot());
    stream.finish();
    if (!load) {
        // Atomic replacement retains the previous complete file if writing or
        // renaming fails. The incomplete .tmp file is never offered for resume.
#ifdef _WIN32
        if (!MoveFileExW(widePath(temporary).c_str(), widePath(destination).c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH))
            throw std::runtime_error("Cannot replace solver checkpoint");
#else
        if (std::rename(temporary.c_str(), destination.c_str()))
            throw std::runtime_error("Cannot replace solver checkpoint");
#endif
    }
    completed_iterations = iteration;
    saved_iterations = iteration;
    checkpoint_converged = converged;
}

void PCfrSolver::checkpointBoundary(bool final) {
    if (checkpoint_file.empty()) return;
    const bool pause = !checkpoint_pause_file.empty() && exists(checkpoint_pause_file);
    if (pause || final || completed_iterations % checkpoint_interval == 0) {
        checkpointState(false);
        checkpointProgress(pause ? "paused" : final ? "complete" : "running");
    } else if (timeSinceEpochMillisec() - checkpoint_progress_time >= 1000) checkpointProgress("running");
    if (pause) std::exit(75); // Do not export a paused strategy as a finished solve.
}
