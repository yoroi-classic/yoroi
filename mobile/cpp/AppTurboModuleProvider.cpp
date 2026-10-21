#include "AppTurboModuleProvider.h"
#include "NativeCmlMobileBridgeModule.h"
#include "NativeMslMobileBridgeModule.h"

namespace facebook::react {

std::shared_ptr<TurboModule> AppTurboModuleProvider::getTurboModule(
    const std::string& name,
    std::shared_ptr<CallInvoker> jsInvoker) const {
  if (name == "MslMobileBridge") {
    return std::make_shared<facebook::react::NativeMslMobileBridgeModule>(jsInvoker);
  }
  if (name == "CmlMobileBridge") {
    return std::make_shared<facebook::react::NativeCmlMobileBridgeModule>(jsInvoker);
  }
  // Other C++ Turbo Native Modules for you app
  return nullptr;
}

} // namespace facebook::react
