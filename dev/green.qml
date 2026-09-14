import Quickshell
import Quickshell.Wayland
import QtQuick

ShellRoot {
  Variants {
    model: Quickshell.screens.filter(s => s.name === "rainpreview")
    PanelWindow {
      required property var modelData
      screen: modelData
      anchors { top: true; bottom: true; left: true; right: true }
      WlrLayershell.layer: WlrLayer.Overlay
      WlrLayershell.namespace: "rain-preview"
      exclusionMode: ExclusionMode.Ignore
      color: "red"
      Image {
        id: img
        anchors.fill: parent
        source: "file:///home/max/.local/state/omarchy/current/theme/backgrounds/bookworm.png"
        fillMode: Image.PreserveAspectCrop
        visible: false
        layer.enabled: true
      }
      ShaderEffect {
        anchors.fill: parent
        property real time: 0
        property vector2d resolution: Qt.vector2d(width, height)
        property var src: img
        fragmentShader: "file:///home/max/Code/rain/shaders/green.frag.qsb"; onStatusChanged: console.log("shader status", status, log, fragmentShader); Component.onCompleted: console.log("resolved", Qt.resolvedUrl("../shaders/green.frag.qsb"), "status0", status)
        NumberAnimation on time { from: 0; to: 100; duration: 100000; loops: Animation.Infinite }
      }
    }
  }
}
