{{- define "collaborative.name" -}}
{{- printf "%s-collaborative" .Release.Name | trunc 48 | trimSuffix "-" -}}
{{- end -}}

{{- define "collaborative.labels" -}}
app.kubernetes.io/name: collaborative
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | quote }}
{{- end -}}

{{- define "collaborative.image" -}}
{{- $image := index .root.Values.images .component -}}
{{- if $image.digest -}}
{{ printf "%s@%s" $image.repository $image.digest }}
{{- else -}}
{{ printf "%s:%s" $image.repository (required "Set image.tag or both images.*.digest to one verified release" .root.Values.image.tag) }}
{{- end -}}
{{- end -}}

{{- define "collaborative.coreEnv" -}}
- name: AUTH_UI_URL
  value: {{ required "publicUrl is required" .Values.publicUrl | trimSuffix "/" | quote }}
- name: SESSION_COOKIE_PREFIX
  value: {{ .Values.sessionCookiePrefix | quote }}
- name: HOST
  value: "0.0.0.0"
- name: PORT
  value: "3001"
- name: PUBLIC_PORT
  value: ""
{{- range $key, $value := .Values.coreEnv }}
{{- if has $key (list "AUTH_UI_URL" "SESSION_COOKIE_PREFIX" "PORT" "HOST" "PUBLIC_PORT" "UI_URL" "NODE_ENV") }}
{{- fail (printf "%s is managed by the chart" $key) }}
{{- end }}
- name: {{ $key }}
  value: {{ $value | toString | quote }}
{{- end }}
{{- end -}}

{{- define "collaborative.secretMounts" -}}
{{- range .Values.coreSecretFiles }}
- name: secret-{{ .name }}
  mountPath: /run/secrets/{{ .name }}
  readOnly: true
{{- end }}
{{- end -}}

{{- define "collaborative.secretVolumes" -}}
{{- range .Values.coreSecretFiles }}
- name: secret-{{ .name }}
  secret:
    secretName: {{ .secretName | quote }}
    defaultMode: 0440
{{- end }}
{{- end -}}
