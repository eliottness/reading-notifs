{{/*
Expand the name of the chart.
*/}}
{{- define "reading-notifs.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "reading-notifs.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "reading-notifs.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "reading-notifs.labels" -}}
helm.sh/chart: {{ include "reading-notifs.chart" . }}
{{ include "reading-notifs.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "reading-notifs.selectorLabels" -}}
app.kubernetes.io/name: {{ include "reading-notifs.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Service account name
*/}}
{{- define "reading-notifs.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "reading-notifs.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Name of the Secret holding sensitive env. Either a user-supplied existing Secret or the
one this chart renders.
*/}}
{{- define "reading-notifs.secretName" -}}
{{- if .Values.secrets.existingSecret }}
{{- .Values.secrets.existingSecret }}
{{- else }}
{{- include "reading-notifs.fullname" . }}
{{- end }}
{{- end }}

{{/*
Resolved public base URL (APP_URL). Prefers config.appUrl, otherwise derives it from the
ingress host when ingress is enabled.
*/}}
{{- define "reading-notifs.appUrl" -}}
{{- if .Values.config.appUrl }}
{{- .Values.config.appUrl }}
{{- else if .Values.ingress.enabled }}
{{- printf "%s://%s" .Values.ingress.scheme .Values.ingress.host }}
{{- else }}
{{- printf "http://localhost:%d" (int .Values.service.port) }}
{{- end }}
{{- end }}
